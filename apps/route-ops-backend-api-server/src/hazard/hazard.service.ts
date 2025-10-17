import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { HazardServiceBase } from "./base/hazard.service.base";
import { AddRemarkToHazardDto } from "./dto/AddRemarkToHazardDto";
import { Remark } from "../remark/base/Remark";

@Injectable()
export class HazardService extends HazardServiceBase {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }

  async addRemarkToHazard(
    hazardId: string,
    userId: string,
    remarkData: AddRemarkToHazardDto
  ): Promise<Remark> {
    // First, check if the hazard exists
    const hazard = await this.prisma.hazard.findUnique({
      where: { id: hazardId },
      include: { project: true },
    });

    if (!hazard) {
      throw new Error(`Hazard with ID ${hazardId} not found`);
    }

    // Check if user has an active survey for this project
    let survey = await this.prisma.survey.findFirst({
      where: {
        assignedUser: userId,
        projectId: hazard.projectId,
        status: "active",
      },
    });

    // If no active survey exists, create one
    if (!survey) {
      survey = await this.prisma.survey.create({
        data: {
          name: `Hazard Survey - ${hazard.typeField || 'Unknown Hazard'}`,
          status: "active",
          assignedUser: userId,
          startTime: new Date(),
          project: { connect: { id: hazard.projectId! } },
        },
      });
    }

    // Create the remark and link it to the hazard and survey
    const remark = await this.prisma.remark.create({
      data: {
        text: remarkData.text,
        timestamp: remarkData.timestamp ? new Date(remarkData.timestamp) : new Date(),
        user: { connect: { id: userId } },
        hazard: { connect: { id: hazardId } },
        survey: { connect: { id: survey.id } },
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
          },
        },
        hazard: {
          select: {
            id: true,
            typeField: true,
            severity: true,
          },
        },
        survey: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
      },
    });

    return remark as Remark;
  }

  async getHazardRemarks(hazardId: string): Promise<Remark[]> {
    const remarks = await this.prisma.remark.findMany({
      where: { hazardId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
          },
        },
        survey: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return remarks as Remark[];
  }
}