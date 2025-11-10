import { ApiProperty } from "@nestjs/swagger";
import { CityHall } from "../../cityHall/base/CityHall";

export class CurrentUserResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  username!: string;

  @ApiProperty({ required: false, nullable: true })
  email!: string | null;

  @ApiProperty({ required: false, nullable: true })
  firstName!: string | null;

  @ApiProperty({ required: false, nullable: true })
  lastName!: string | null;

  @ApiProperty({ type: [String] })
  roles!: string[];

  @ApiProperty({ required: false, nullable: true })
  role?: string | null;

  @ApiProperty({ type: () => CityHall, required: false, nullable: true })
  cityHall?: CityHall | null;

  @ApiProperty({ required: false, nullable: true })
  isActive?: boolean | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

