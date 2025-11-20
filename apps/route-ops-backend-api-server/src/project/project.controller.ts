import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { ProjectService } from "./project.service";
import { ProjectControllerBase } from "./base/project.controller.base";
import { PrismaService } from "../prisma/prisma.service";
import { CreateProjectDto } from "./dto/CreateProjectDto";
import { Project } from "./base/Project";
import { ProjectCreateInput } from "./base/ProjectCreateInput";
import { UserData } from "../auth/userData.decorator";

@swagger.ApiTags("projects")
@common.Controller("projects")
export class ProjectController extends ProjectControllerBase {
  constructor(
    protected readonly service: ProjectService,
    @nestAccessControl.InjectRolesBuilder()
    protected readonly rolesBuilder: nestAccessControl.RolesBuilder,
    protected readonly prisma: PrismaService
  ) {
    super(service, rolesBuilder, prisma);
  }

  @common.Post()
  @swagger.ApiOperation({ 
    summary: "Create a new project",
    description: "Creates a new project with a clean, flat API body. Route points are created automatically from coordinates."
  })
  @swagger.ApiCreatedResponse({ 
    type: Project,
    description: "The project has been successfully created."
  })
  @swagger.ApiBadRequestResponse({ 
    description: "Invalid input data."
  })
  @swagger.ApiForbiddenResponse({ 
    description: "Insufficient permissions."
  })
  @nestAccessControl.UseRoles({
    resource: "Project",
    action: "create",
    possession: "own",
  })
  async createProject(
    @common.Body() data: CreateProjectDto | ProjectCreateInput,
    @UserData() currentUser?: { id: string }
  ): Promise<Project> {
    // Check if it's our simplified DTO (has routePoints array)
    if ('routePoints' in data && Array.isArray(data.routePoints)) {
      const dto = data as CreateProjectDto;
      // If assignedUserId is not provided, default to the current user (creator)
      if (!dto.assignedUserId && currentUser?.id) {
        dto.assignedUserId = currentUser.id;
      }
      return await this.service.createProjectWithRoutePoints(dto);
    }
    
    // Fall back to original implementation for backward compatibility
    const input = data as ProjectCreateInput;
    // If assignedUser is not provided, default to the current user (creator)
    if (!input.assignedUser && currentUser?.id) {
      input.assignedUser = currentUser.id;
    }
    return await super.createProject(input);
  }
}
