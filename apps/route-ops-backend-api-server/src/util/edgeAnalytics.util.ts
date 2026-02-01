/**
 * Shared types and helper for edge analytics: logical survey deduplication
 * (projectId + survey startTime = one logical survey, no duplicate Survey rows).
 */

export type EdgeAnalyticsHistoryEntry = {
  surveyId: string | null;
  projectId: string | null;
  createdAt: Date;
  eiri: number | null;
};

export type EdgeAnalyticsSurveyLookup = {
  id: string;
  name: string | null;
  status: string | null;
  startTime: Date | null;
  endTime: Date | null;
};

export type EdgeAnalyticsProjectLookup = {
  id: string;
  createdBy: string | null;
  description: string | null;
};

export type EdgeAnalyticsRecentSurvey = {
  id: string | null;
  projectId: string | null;
  name: string | null;
  status: string | null;
  startTime: Date | null;
  endTime: Date | null;
  eIriAvg: number | null;
  createdBy: string | null;
  createdByName: string | null;
  projectDescription: string | null;
  anomalyCount: number;
};

export type ComputeLogicalSurveyTotalsParams = {
  historyEntries: EdgeAnalyticsHistoryEntry[];
  surveyById: Map<string, EdgeAnalyticsSurveyLookup>;
  projectById: Map<string, EdgeAnalyticsProjectLookup>;
  creatorNameById: Map<string, string>;
  anomalyCountByProjectId: Map<string, number>;
  take?: number;
};

export type ComputeLogicalSurveyTotalsResult = {
  totalSurveys: number;
  recentSurveys: EdgeAnalyticsRecentSurvey[];
};

const getLogicalSurveyKey = (
  h: EdgeAnalyticsHistoryEntry,
  surveyById: Map<string, EdgeAnalyticsSurveyLookup>
): string | null => {
  const survey = h.surveyId ? surveyById.get(h.surveyId) : null;
  const startTime = survey?.startTime != null ? new Date(survey.startTime).getTime() : null;
  if (h.projectId == null || startTime == null) return null;
  return `${h.projectId}\0${startTime}`;
};

/**
 * Groups history by logical survey (projectId + survey startTime), computes totalSurveys
 * and recentSurveys with creator names and anomaly counts. Used by survey and roads edge-analytics.
 */
export const computeLogicalSurveyTotals = (
  params: ComputeLogicalSurveyTotalsParams
): ComputeLogicalSurveyTotalsResult => {
  const {
    historyEntries,
    surveyById,
    projectById,
    creatorNameById,
    anomalyCountByProjectId,
    take = 20,
  } = params;

  const historyByLogicalSurvey = new Map<string, EdgeAnalyticsHistoryEntry[]>();
  for (const h of historyEntries) {
    const key = getLogicalSurveyKey(h, surveyById);
    if (key) {
      const list = historyByLogicalSurvey.get(key) ?? [];
      list.push(h);
      historyByLogicalSurvey.set(key, list);
    }
  }

  const totalSurveys = historyByLogicalSurvey.size;
  const sortedLogicalKeys = Array.from(historyByLogicalSurvey.keys()).sort((a, b) => {
    const entriesA = historyByLogicalSurvey.get(a) ?? [];
    const entriesB = historyByLogicalSurvey.get(b) ?? [];
    const maxCreatedA = Math.max(...entriesA.map((e) => new Date(e.createdAt).getTime()));
    const maxCreatedB = Math.max(...entriesB.map((e) => new Date(e.createdAt).getTime()));
    return maxCreatedB - maxCreatedA;
  });

  const recentSurveys: EdgeAnalyticsRecentSurvey[] = sortedLogicalKeys.slice(0, take).map((logicalKey) => {
    const entries = historyByLogicalSurvey.get(logicalKey) ?? [];
    const latestEntry = entries.reduce((best, e) =>
      new Date(e.createdAt).getTime() > new Date(best.createdAt).getTime() ? e : best
    );
    const survey = latestEntry.surveyId ? surveyById.get(latestEntry.surveyId) : null;
    const project = latestEntry.projectId ? projectById.get(latestEntry.projectId) : null;
    const creatorId = project?.createdBy ?? null;
    const projectId = latestEntry.projectId ?? null;
    const anomalyCount = anomalyCountByProjectId.get(projectId ?? "") ?? 0;
    const eIriAvg =
      entries.length > 0
        ? entries.reduce((sum, e) => sum + (e.eiri ?? 0), 0) / entries.length
        : null;

    return {
      id: survey?.id ?? null,
      projectId,
      name: survey?.name ?? null,
      status: survey?.status ?? null,
      startTime: survey?.startTime ?? null,
      endTime: survey?.endTime ?? null,
      eIriAvg,
      createdBy: creatorId,
      createdByName: creatorId ? creatorNameById.get(creatorId) ?? null : null,
      projectDescription: project?.description ?? null,
      anomalyCount,
    };
  });

  return { totalSurveys, recentSurveys };
};
