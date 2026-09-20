import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ROLES } from '../common/constants';
import { Roles, RolesGuard } from '../common/roles.guard';
import { CreatePatientDto, RecordsService, UpdateRecordDto } from './records.service';

interface ActorRequest {
  user: { name: string; role: string };
}

@Controller()
export class RecordsController {
  constructor(private readonly recordsService: RecordsService) {}

  @Get('summary')
  summary() {
    return this.recordsService.summary();
  }

  @Get('patients')
  patients(@Query('keyword') keyword?: string) {
    return this.recordsService.searchPatients(keyword);
  }

  @Post('patients')
  createPatient(@Body() body: CreatePatientDto) {
    return this.recordsService.createPatient(body);
  }

  @Get('patients/:id/timeline')
  timeline(@Param('id') id: string) {
    return this.recordsService.timeline(Number(id));
  }

  @Post('patients/:id/records')
  createRecord(@Param('id') id: string) {
    return this.recordsService.createRecord(Number(id));
  }

  @Put('records/:id')
  @UseGuards(RolesGuard)
  @Roles(ROLES.doctor, ROLES.admin)
  updateRecord(@Param('id') id: string, @Body() body: UpdateRecordDto, @Req() request: ActorRequest) {
    return this.recordsService.updateRecord(Number(id), body, request.user.name);
  }

  @Get('records/:id/versions')
  versions(@Param('id') id: string) {
    return this.recordsService.listVersions(Number(id));
  }
}
