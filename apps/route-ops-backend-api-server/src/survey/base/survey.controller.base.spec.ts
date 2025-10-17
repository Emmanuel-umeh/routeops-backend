import { Test } from "@nestjs/testing";
import {
  INestApplication,
  HttpStatus,
  ExecutionContext,
  CallHandler,
} from "@nestjs/common";
import request from "supertest";
import { ACGuard } from "nest-access-control";
import { DefaultAuthGuard } from "../../auth/defaultAuth.guard";
import { ACLModule } from "../../auth/acl.module";
import { AclFilterResponseInterceptor } from "../../interceptors/aclFilterResponse.interceptor";
import { AclValidateRequestInterceptor } from "../../interceptors/aclValidateRequest.interceptor";
import { map } from "rxjs";
import { SurveyController } from "../survey.controller";
import { SurveyService } from "../survey.service";

const nonExistingId = "nonExistingId";
const existingId = "existingId";
const CREATE_INPUT = {
  assignedUser: "exampleAssignedUser",
  createdAt: new Date(),
  endTime: new Date(),
  id: "exampleId",
  name: "exampleName",
  remarks: "exampleRemarks",
  startTime: new Date(),
  status: "exampleStatus",
  updatedAt: new Date(),
};
const CREATE_RESULT = {
  assignedUser: "exampleAssignedUser",
  createdAt: new Date(),
  endTime: new Date(),
  id: "exampleId",
  name: "exampleName",
  remarks: "exampleRemarks",
  startTime: new Date(),
  status: "exampleStatus",
  updatedAt: new Date(),
};
const FIND_MANY_RESULT = [
  {
    assignedUser: "exampleAssignedUser",
    createdAt: new Date(),
    endTime: new Date(),
    id: "exampleId",
    name: "exampleName",
    remarks: "exampleRemarks",
    startTime: new Date(),
    status: "exampleStatus",
    updatedAt: new Date(),
  },
];
const FIND_ONE_RESULT = {
  assignedUser: "exampleAssignedUser",
  createdAt: new Date(),
  endTime: new Date(),
  id: "exampleId",
  name: "exampleName",
  remarks: "exampleRemarks",
  startTime: new Date(),
  status: "exampleStatus",
  updatedAt: new Date(),
};

const service = {
  createSurvey() {
    return CREATE_RESULT;
  },
  surveys: () => FIND_MANY_RESULT,
  survey: ({ where }: { where: { id: string } }) => {
    switch (where.id) {
      case existingId:
        return FIND_ONE_RESULT;
      case nonExistingId:
        return null;
    }
  },
};

const basicAuthGuard = {
  canActivate: (context: ExecutionContext) => {
    const argumentHost = context.switchToHttp();
    const request = argumentHost.getRequest();
    request.user = {
      roles: ["user"],
    };
    return true;
  },
};

const acGuard = {
  canActivate: () => {
    return true;
  },
};

const aclFilterResponseInterceptor = {
  intercept: (context: ExecutionContext, next: CallHandler) => {
    return next.handle().pipe(
      map((data) => {
        return data;
      })
    );
  },
};
const aclValidateRequestInterceptor = {
  intercept: (context: ExecutionContext, next: CallHandler) => {
    return next.handle();
  },
};

describe("Survey", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        {
          provide: SurveyService,
          useValue: service,
        },
      ],
      controllers: [SurveyController],
      imports: [ACLModule],
    })
      .overrideGuard(DefaultAuthGuard)
      .useValue(basicAuthGuard)
      .overrideGuard(ACGuard)
      .useValue(acGuard)
      .overrideInterceptor(AclFilterResponseInterceptor)
      .useValue(aclFilterResponseInterceptor)
      .overrideInterceptor(AclValidateRequestInterceptor)
      .useValue(aclValidateRequestInterceptor)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  test("POST /surveys", async () => {
    await request(app.getHttpServer())
      .post("/surveys")
      .send(CREATE_INPUT)
      .expect(HttpStatus.CREATED)
      .expect({
        ...CREATE_RESULT,
        createdAt: CREATE_RESULT.createdAt.toISOString(),
        endTime: CREATE_RESULT.endTime.toISOString(),
        startTime: CREATE_RESULT.startTime.toISOString(),
        updatedAt: CREATE_RESULT.updatedAt.toISOString(),
      });
  });

  test("GET /surveys", async () => {
    await request(app.getHttpServer())
      .get("/surveys")
      .expect(HttpStatus.OK)
      .expect([
        {
          ...FIND_MANY_RESULT[0],
          createdAt: FIND_MANY_RESULT[0].createdAt.toISOString(),
          endTime: FIND_MANY_RESULT[0].endTime.toISOString(),
          startTime: FIND_MANY_RESULT[0].startTime.toISOString(),
          updatedAt: FIND_MANY_RESULT[0].updatedAt.toISOString(),
        },
      ]);
  });

  test("GET /surveys/:id non existing", async () => {
    await request(app.getHttpServer())
      .get(`${"/surveys"}/${nonExistingId}`)
      .expect(HttpStatus.NOT_FOUND)
      .expect({
        statusCode: HttpStatus.NOT_FOUND,
        message: `No resource was found for {"${"id"}":"${nonExistingId}"}`,
        error: "Not Found",
      });
  });

  test("GET /surveys/:id existing", async () => {
    await request(app.getHttpServer())
      .get(`${"/surveys"}/${existingId}`)
      .expect(HttpStatus.OK)
      .expect({
        ...FIND_ONE_RESULT,
        createdAt: FIND_ONE_RESULT.createdAt.toISOString(),
        endTime: FIND_ONE_RESULT.endTime.toISOString(),
        startTime: FIND_ONE_RESULT.startTime.toISOString(),
        updatedAt: FIND_ONE_RESULT.updatedAt.toISOString(),
      });
  });

  test("POST /surveys existing resource", async () => {
    const agent = request(app.getHttpServer());
    await agent
      .post("/surveys")
      .send(CREATE_INPUT)
      .expect(HttpStatus.CREATED)
      .expect({
        ...CREATE_RESULT,
        createdAt: CREATE_RESULT.createdAt.toISOString(),
        endTime: CREATE_RESULT.endTime.toISOString(),
        startTime: CREATE_RESULT.startTime.toISOString(),
        updatedAt: CREATE_RESULT.updatedAt.toISOString(),
      })
      .then(function () {
        agent
          .post("/surveys")
          .send(CREATE_INPUT)
          .expect(HttpStatus.CONFLICT)
          .expect({
            statusCode: HttpStatus.CONFLICT,
          });
      });
  });

  afterAll(async () => {
    await app.close();
  });
});
