import * as common from "@nestjs/common";
import * as swagger from "@nestjs/swagger";
import * as nestAccessControl from "nest-access-control";
import { ProjectService } from "./project.service";
import { ProjectControllerBase } from "./base/project.controller.base";
import { PrismaService } from "../prisma/prisma.service";
import { CreateProjectDto } from "./dto/CreateProjectDto";
import { Project } from "./base/Project";
import { ProjectCreateInput } from "./base/ProjectCreateInput";

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
    possession: "any",
  })
  async createProject(
    @common.Body() data: CreateProjectDto | ProjectCreateInput
  ): Promise<Project> {
    // Check if it's our simplified DTO (has routePoints array)
    if ('routePoints' in data && Array.isArray(data.routePoints)) {
      return await this.service.createProjectWithRoutePoints(data as CreateProjectDto);
    }
    
    // Fall back to original implementation for backward compatibility
    return await super.createProject(data as ProjectCreateInput);
  }
}
