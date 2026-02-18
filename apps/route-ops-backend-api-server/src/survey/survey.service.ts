import { Injectable } from "@nestjs/common";
import { Prisma, Survey as PrismaSurvey } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SurveyServiceBase } from "./base/survey.service.base";

@Injectable()
export class SurveyService extends SurveyServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }

  /**
   * When a survey is deleted, remove its RoadRatingHistory entries and
   * recalculate RoadRating for all affected (entityId, roadId, segmentId) pairs.
   */
  async deleteSurvey(args: Prisma.SurveyDeleteArgs): Promise<PrismaSurvey> {
    return this.prisma.$transaction(async (tx) => {
      // Load survey with project to get entityId and survey id
      const existing = await tx.survey.findUnique({
        where: args.where,
        select: {
          id: true,
          project: {
            select: {
              cityHallId: true,
            },
          },
        },
      });

      if (!existing) {
        // Fallback to base behavior if survey does not exist
        return tx.survey.delete(args);
      }

      const entityId = existing.project?.cityHallId ?? null;

      // If we don't have an entity, just delete the survey without touching ratings
      if (!entityId) {
        return tx.survey.delete(args);
      }

      // Find all history rows for this survey to know which ratings are affected
      const historyRows = await tx.roadRatingHistory.findMany({
        where: {
          surveyId: existing.id,
          entityId,
        },
        select: {
          roadId: true,
          segmentId: true,
        },
      });

      // Delete the survey row itself
      const deleted = await tx.survey.delete(args);

      if (historyRows.length === 0) {
        return deleted;
      }

      // Remove history entries for this survey
      await tx.roadRatingHistory.deleteMany({
        where: {
          surveyId: existing.id,
          entityId,
        },
      });

      // Recalculate ratings for each affected (roadId, segmentId)
      const affectedKeys = new Set<string>();
      for (const row of historyRows) {
        const key = `${row.roadId}__${row.segmentId ?? "null"}`;
        affectedKeys.add(key);
      }

      for (const key of affectedKeys) {
        const [roadId, segmentToken] = key.split("__");
        const segmentId = segmentToken === "null" ? null : segmentToken;

        const remainingHistory = await tx.roadRatingHistory.findMany({
          where: {
            entityId,
            roadId,
            segmentId,
          },
          select: {
            eiri: true,
          },
        });

        if (remainingHistory.length === 0) {
          // No more history for this segment: remove the current rating
          await tx.roadRating.deleteMany({
            where: {
              entityId,
              roadId,
              segmentId,
            },
          });
          continue;
        }

        const overallAvgEiri =
          remainingHistory.reduce((sum, r) => sum + r.eiri, 0) /
          remainingHistory.length;

        // Update existing rating for this segment
        await tx.roadRating.updateMany({
          where: {
            entityId,
            roadId,
            segmentId,
          },
          data: {
            eiri: overallAvgEiri,
          },
        });
      }

      return deleted;
    });
  }
}
