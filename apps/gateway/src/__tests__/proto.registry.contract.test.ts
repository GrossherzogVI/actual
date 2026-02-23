import { readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { rpcRegistry } from '../contracts/rpc-registry';

type ProtoRpc = {
  service: string;
  rpc: string;
  requestType: string;
  requiresEnvelope: boolean;
  source: string;
};

const PROTO_PACKAGE_PREFIX = 'financeos.';
const ENVELOPE_FIELD_PATTERN =
  /\bfinanceos\.common\.v1\.CommandEnvelope\s+envelope\s*=/;

function registryKey(service: string, rpc: string): string {
  return `${service}::${rpc}`;
}

function collectProtoFiles(rootDir: string): string[] {
  const output: string[] = [];
  const queue = [rootDir];

  while (queue.length > 0) {
    const current = queue.pop();
    if (!current) {
      continue;
    }

    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const entryPath = resolve(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(entryPath);
      } else if (entry.isFile() && entry.name.endsWith('.proto')) {
        output.push(entryPath);
      }
    }
  }

  return output.sort();
}

function toRegistryService(packageName: string): string {
  if (!packageName.startsWith(PROTO_PACKAGE_PREFIX)) {
    throw new Error(`Unexpected proto package: ${packageName}`);
  }
  return packageName.slice(PROTO_PACKAGE_PREFIX.length);
}

function parseMessageEnvelopeMap(protoText: string): Map<string, boolean> {
  const map = new Map<string, boolean>();
  const messageRegex = /message\s+([A-Za-z0-9_]+)\s*\{([\s\S]*?)^\s*}/gm;

  for (;;) {
    const match = messageRegex.exec(protoText);
    if (!match) {
      break;
    }
    const messageName = match[1];
    const messageBody = match[2] ?? '';
    if (!messageName) {
      continue;
    }
    map.set(messageName, ENVELOPE_FIELD_PATTERN.test(messageBody));
  }

  return map;
}

function parseProtoRpcs(filePath: string, protoRoot: string): ProtoRpc[] {
  const text = readFileSync(filePath, 'utf8');
  const packageMatch = text.match(/^\s*package\s+([a-zA-Z0-9_.]+)\s*;/m);
  if (!packageMatch?.[1]) {
    return [];
  }

  const packageName = packageMatch[1];
  if (packageName === 'financeos.common.v1') {
    return [];
  }

  const service = toRegistryService(packageName);
  const messageEnvelopeMap = parseMessageEnvelopeMap(text);
  const result: ProtoRpc[] = [];
  const serviceBlockRegex = /service\s+[A-Za-z0-9_]+\s*\{([\s\S]*?)^\s*}/gm;

  for (;;) {
    const serviceBlockMatch = serviceBlockRegex.exec(text);
    if (!serviceBlockMatch) {
      break;
    }

    const serviceBody = serviceBlockMatch[1] ?? '';
    const rpcRegex =
      /rpc\s+([A-Za-z0-9_]+)\s*\(\s*([A-Za-z0-9_]+)\s*\)\s*returns\s*\(\s*([A-Za-z0-9_]+)\s*\)\s*;/g;

    for (;;) {
      const rpcMatch = rpcRegex.exec(serviceBody);
      if (!rpcMatch) {
        break;
      }

      const rpcName = rpcMatch[1];
      const requestType = rpcMatch[2];

      if (!rpcName || !requestType) {
        continue;
      }

      result.push({
        service,
        rpc: rpcName,
        requestType,
        requiresEnvelope: messageEnvelopeMap.get(requestType) === true,
        source: relative(protoRoot, filePath),
      });
    }
  }

  return result;
}

function loadProtoRpcs(): ProtoRpc[] {
  const testDir = dirname(fileURLToPath(import.meta.url));
  const protoRoot = resolve(testDir, '../../../../packages/contracts/proto');
  const files = collectProtoFiles(protoRoot);

  return files.flatMap(filePath => parseProtoRpcs(filePath, protoRoot));
}

describe('proto to gateway registry contract', () => {
  it('keeps RPC registry synchronized with proto service surface', () => {
    const protoRpcs = loadProtoRpcs();
    const protoKeys = new Set(protoRpcs.map(rpc => registryKey(rpc.service, rpc.rpc)));
    const registryKeys = new Set(
      rpcRegistry.map(entry => registryKey(entry.service, entry.rpc)),
    );

    const missingFromRegistry = protoRpcs
      .filter(rpc => !registryKeys.has(registryKey(rpc.service, rpc.rpc)))
      .map(rpc => `${rpc.service}.${rpc.rpc} (${rpc.source})`);
    const extraInRegistry = rpcRegistry
      .filter(entry => !protoKeys.has(registryKey(entry.service, entry.rpc)))
      .map(entry => `${entry.service}.${entry.rpc}`);

    expect(missingFromRegistry).toEqual([]);
    expect(extraInRegistry).toEqual([]);
  });

  it('keeps envelope requirements aligned between proto requests and registry metadata', () => {
    const protoRpcs = loadProtoRpcs();
    const registryByKey = new Map(
      rpcRegistry.map(entry => [registryKey(entry.service, entry.rpc), entry]),
    );

    const mismatches = protoRpcs.flatMap(proto => {
      const entry = registryByKey.get(registryKey(proto.service, proto.rpc));
      if (!entry) {
        return [];
      }
      if (entry.requiresEnvelope === proto.requiresEnvelope) {
        return [];
      }
      return [
        `${proto.service}.${proto.rpc}: proto requiresEnvelope=${proto.requiresEnvelope}, registry requiresEnvelope=${entry.requiresEnvelope}`,
      ];
    });

    expect(mismatches).toEqual([]);
  });

  it('enforces envelope validation in request schemas for protected RPCs', () => {
    const violations = rpcRegistry.flatMap(entry => {
      if (!entry.requiresEnvelope) {
        return [];
      }

      if (!entry.requestSchema) {
        return [`${entry.service}.${entry.rpc}: missing requestSchema`];
      }

      const result = entry.requestSchema.safeParse({});
      if (result.success) {
        return [`${entry.service}.${entry.rpc}: accepts empty payload`];
      }

      const hasEnvelopeIssue = result.error.issues.some(
        issue => issue.path[0] === 'envelope',
      );
      if (hasEnvelopeIssue) {
        return [];
      }

      return [`${entry.service}.${entry.rpc}: schema does not require envelope`];
    });

    expect(violations).toEqual([]);
  });
});
