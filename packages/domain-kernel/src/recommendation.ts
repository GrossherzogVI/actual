export type Recommendation = {
  id: string;
  title: string;
  confidence: number;
  provenance: string;
  expectedImpact: string;
  reversible: boolean;
  rationale: string;
};

export function scoreRecommendation(recommendation: Recommendation): number {
  const impactWeight = recommendation.expectedImpact.includes('risk') ? 1.2 : 1;
  const reversibleWeight = recommendation.reversible ? 1 : 0.85;
  return recommendation.confidence * impactWeight * reversibleWeight;
}

export function rankRecommendations(
  recommendations: Recommendation[],
): Recommendation[] {
  return [...recommendations].sort(
    (a, b) => scoreRecommendation(b) - scoreRecommendation(a),
  );
}
