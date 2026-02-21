// @ts-strict-ignore
import * as asyncStorage from '../../platform/server/asyncStorage';
import { createApp } from '../app';
import { del, get, post } from '../post';
import { getServer } from '../server-config';

export type ContractDocumentEntity = {
  id: string;
  contract_id: string | null;
  file_path: string;
  file_type: string;
  ocr_text: string | null;
  uploaded_at: string;
};

export type InvoiceEntity = {
  id: string;
  contract_id: string | null;
  file_id: string | null;
  amount: number;
  due_date: string | null;
  status: string;
  transaction_id: string | null;
  document_id: string | null;
  created_at: string;
};

export type ExtractedInvoiceData = {
  vendor: string | null;
  amount: number | null;
  dueDate: string | null;
  invoiceNumber: string | null;
  description: string | null;
  confidence: number;
};

export type DocumentProcessResult = {
  ocrText: string;
  extractedData: ExtractedInvoiceData;
  invoiceId: string | null;
};

export type DocumentHandlers = {
  'document-upload': typeof uploadDocument;
  'document-list': typeof listDocuments;
  'document-get': typeof getDocument;
  'document-delete': typeof deleteDocument;
  'document-process': typeof processDocument;
  'invoice-list': typeof listInvoices;
  'invoice-match': typeof matchInvoice;
};

export const app = createApp<DocumentHandlers>();

app.method('document-upload', uploadDocument);
app.method('document-list', listDocuments);
app.method('document-get', getDocument);
app.method('document-delete', deleteDocument);
app.method('document-process', processDocument);
app.method('invoice-list', listInvoices);
app.method('invoice-match', matchInvoice);

async function uploadDocument(data: {
  fileId: string;
  contractId?: string;
  fileName?: string;
  fileType?: string;
  content: string; // base64
}): Promise<ContractDocumentEntity | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const result = await post(
      getServer().BASE_SERVER + '/documents/upload',
      data,
      { 'X-ACTUAL-TOKEN': userToken },
    );
    return result as ContractDocumentEntity;
  } catch (err) {
    return { error: err.reason || err.message || 'unknown' };
  }
}

async function listDocuments(args: {
  fileId: string;
  contractId?: string;
}): Promise<ContractDocumentEntity[] | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  const params = new URLSearchParams({ fileId: args.fileId });
  if (args.contractId) params.set('contractId', args.contractId);

  try {
    const res = await get(
      getServer().BASE_SERVER + `/documents?${params.toString()}`,
      { headers: { 'X-ACTUAL-TOKEN': userToken } },
    );
    if (res) {
      const parsed = JSON.parse(res);
      if (parsed.status === 'ok') return parsed.data;
      return { error: parsed.reason || 'unknown' };
    }
  } catch (err) {
    return { error: err.message || 'network-failure' };
  }
  return { error: 'no-response' };
}

async function getDocument(args: {
  id: string;
}): Promise<ContractDocumentEntity | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const res = await get(
      getServer().BASE_SERVER + `/documents/${args.id}`,
      { headers: { 'X-ACTUAL-TOKEN': userToken } },
    );
    if (res) {
      const parsed = JSON.parse(res);
      if (parsed.status === 'ok') return parsed.data;
      return { error: parsed.reason || 'unknown' };
    }
  } catch (err) {
    return { error: err.message || 'network-failure' };
  }
  return { error: 'no-response' };
}

async function deleteDocument(args: {
  id: string;
}): Promise<{ deleted: boolean } | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const result = await del(
      getServer().BASE_SERVER + `/documents/${args.id}`,
      {},
      { 'X-ACTUAL-TOKEN': userToken },
    );
    return result as { deleted: boolean };
  } catch (err) {
    return { error: err.reason || err.message || 'unknown' };
  }
}

async function processDocument(args: {
  id: string;
}): Promise<DocumentProcessResult | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const result = await post(
      getServer().BASE_SERVER + `/documents/${args.id}/process`,
      {},
      { 'X-ACTUAL-TOKEN': userToken },
    );
    return result as DocumentProcessResult;
  } catch (err) {
    return { error: err.reason || err.message || 'unknown' };
  }
}

async function listInvoices(args: {
  fileId: string;
  contractId?: string;
  status?: string;
}): Promise<InvoiceEntity[] | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  const params = new URLSearchParams({ fileId: args.fileId });
  if (args.contractId) params.set('contractId', args.contractId);
  if (args.status) params.set('status', args.status);

  try {
    const res = await get(
      getServer().BASE_SERVER +
        `/documents/invoices?${params.toString()}`,
      { headers: { 'X-ACTUAL-TOKEN': userToken } },
    );
    if (res) {
      const parsed = JSON.parse(res);
      if (parsed.status === 'ok') return parsed.data;
      return { error: parsed.reason || 'unknown' };
    }
  } catch (err) {
    return { error: err.message || 'network-failure' };
  }
  return { error: 'no-response' };
}

async function matchInvoice(args: {
  id: string;
  transactionId: string;
}): Promise<InvoiceEntity | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const result = await post(
      getServer().BASE_SERVER + `/documents/invoices/${args.id}/match`,
      { transactionId: args.transactionId },
      { 'X-ACTUAL-TOKEN': userToken },
    );
    return result as InvoiceEntity;
  } catch (err) {
    return { error: err.reason || err.message || 'unknown' };
  }
}
