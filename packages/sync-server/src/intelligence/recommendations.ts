import { v4 as uuidv4 } from 'uuid';

import { getAccountDb } from '../account-db.js';

export type RecommendationPriority = 'low' | 'medium' | 'high';

export type Recommendation = {
  id: string;
  type: string;
  title: string;
  description: string;
  action?: { type: string; params: Record<string, unknown> };
  priority: RecommendationPriority;
};

/**
 * Generate actionable recommendations for a budget file.
 */
export async function generateRecommendations(
  fileId: string,
): Promise<Recommendation[]> {
  const recommendations: Recommendation[] = [];

  recommendations.push(...getCreateContractRecommendations(fileId));
  recommendations.push(...getCancelSuggestionRecommendations(fileId));
  recommendations.push(...getRuleCreationRecommendations(fileId));

  return recommendations;
}

/**
 * Suggest creating a contract from recurring schedules that lack one.
 */
function getCreateContractRecommendations(fileId: string): Recommendation[] {
  const db = getAccountDb();

  try {
    const rows = db.all(
      `SELECT s.id, s.name, COUNT(t.id) AS tx_count
       FROM schedules s
       LEFT JOIN transactions t ON t.schedule_id = s.id AND t.file_id = ?
       WHERE s.file_id = ?
         AND s.id NOT IN (SELECT schedule_id FROM contracts WHERE schedule_id IS NOT NULL AND file_id = ?)
       GROUP BY s.id
       HAVING tx_count >= 3
       ORDER BY tx_count DESC
       LIMIT 10`,
      [fileId, fileId, fileId],
    ) as Array<{ id: string; name: string; tx_count: number }>;

    return rows.map((row) => ({
      id: uuidv4(),
      type: 'create-contract',
      title: `Create contract for "${row.name}"`,
      description: `Schedule "${row.name}" has ${row.tx_count} transactions but no contract. Creating one helps track costs and cancellation deadlines.`,
      action: {
        type: 'navigate',
        params: { route: '/contracts/new', scheduleId: row.id },
      },
      priority: 'medium' as RecommendationPriority,
    }));
  } catch {
    return [];
  }
}

/**
 * Suggest cancelling contracts that seem to have poor value
 * (high cost relative to category usage).
 */
function getCancelSuggestionRecommendations(fileId: string): Recommendation[] {
  const db = getAccountDb();

  try {
    const rows = db.all(
      `SELECT c.id, c.name, c.amount, c.category_id,
              (SELECT COUNT(*) FROM transactions t
               WHERE t.category = c.category_id AND t.file_id = ?
                 AND t.date >= date('now', '-3 months')) AS recent_tx_count
       FROM contracts c
       WHERE c.file_id = ?
         AND c.status = 'active'
         AND c.amount IS NOT NULL
         AND c.amount > 0
         AND c.category_id IS NOT NULL
       HAVING recent_tx_count <= 1
       ORDER BY c.amount DESC
       LIMIT 5`,
      [fileId, fileId],
    ) as Array<{
      id: string;
      name: string;
      amount: number;
      category_id: string;
      recent_tx_count: number;
    }>;

    return rows.map((row) => ({
      id: uuidv4(),
      type: 'cancel-suggestion',
      title: `Consider cancelling "${row.name}"`,
      description: `"${row.name}" costs ${row.amount} but its category has had only ${row.recent_tx_count} transaction(s) in the last 3 months.`,
      action: {
        type: 'navigate',
        params: { route: `/contracts/${row.id}` },
      },
      priority: (row.amount > 5000 ? 'high' : 'medium') as RecommendationPriority,
    }));
  } catch {
    return [];
  }
}

/**
 * Suggest creating categorization rules for payees that are frequently
 * manually categorized the same way.
 */
function getRuleCreationRecommendations(fileId: string): Recommendation[] {
  const db = getAccountDb();

  try {
    const rows = db.all(
      `SELECT t.payee, t.category, COUNT(*) AS hit_count
       FROM transactions t
       WHERE t.file_id = ?
         AND t.category IS NOT NULL
         AND t.payee IS NOT NULL
         AND t.date >= date('now', '-6 months')
       GROUP BY t.payee, t.category
       HAVING hit_count >= 5
       ORDER BY hit_count DESC
       LIMIT 10`,
      [fileId],
    ) as Array<{ payee: string; category: string; hit_count: number }>;

    return rows.map((row) => ({
      id: uuidv4(),
      type: 'rule-creation',
      title: `Create rule for "${row.payee}"`,
      description: `"${row.payee}" has been categorized to the same category ${row.hit_count} times. A rule would automate this.`,
      action: {
        type: 'create-rule',
        params: {
          payeePattern: row.payee,
          categoryId: row.category,
        },
      },
      priority: (row.hit_count >= 10 ? 'high' : 'medium') as RecommendationPriority,
    }));
  } catch {
    return [];
  }
}
