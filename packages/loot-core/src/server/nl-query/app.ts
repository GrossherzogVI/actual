// @ts-strict-ignore
import * as asyncStorage from '../../platform/server/asyncStorage';
import { createApp } from '../app';
import { post } from '../post';
import { getServer } from '../server-config';

export type QueryResult = {
  answer: string;
  data?: unknown[];
  chartData?: unknown;
};

export type NLQueryHandlers = {
  'nl-query-ask': typeof askQuestion;
};

export const app = createApp<NLQueryHandlers>();

app.method('nl-query-ask', askQuestion);

async function askQuestion(args: {
  question: string;
  fileId: string;
}): Promise<QueryResult | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const result = await post(
      getServer().BASE_SERVER + '/nl-query/ask',
      { question: args.question, fileId: args.fileId },
      { 'X-ACTUAL-TOKEN': userToken },
    );
    return result as QueryResult;
  } catch (err) {
    return { error: err.reason || err.message || 'unknown' };
  }
}
