import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ROLES } from '../common/constants';
import { Roles, RolesGuard } from '../common/roles.guard';
import { CreateRevisionDto, ReviewRevisionDto, RevisionsService } from './revisions.service';

interface ActorRequest {
  user: { name: string; role: string };
}

@Controller()
export class RevisionsController {
  constructor(private readonly revisionsService: RevisionsService) {}

  @Post('records/:id/revision-requests')
  @UseGuards(RolesGuard)
  @Roles(ROLES.doctor, ROLES.admin)
  submit(@Param('id') id: string, @Body() body: CreateRevisionDto, @Req() request: ActorRequest) {
    return this.revisionsService.submit(Number(id), { ...body, doctor: request.user.name });
  }

  @Get('records/:id/revision-requests')
  listForRecord(@Param('id') id: string) {
    return this.revisionsService.listForRecord(Number(id));
  }

  @Get('revision-requests/pending')
  @UseGuards(RolesGuard)
  @Roles(ROLES.admin)
  listPending() {
    return this.revisionsService.listPending();
  }

  @Post('revision-requests/:id/approve')
  @UseGuards(RolesGuard)
  @Roles(ROLES.admin)
  approve(@Param('id') id: string, @Body() body: ReviewRevisionDto, @Req() request: ActorRequest) {
    return this.revisionsService.approve(Number(id), { ...body, reviewer: request.user.name });
  }

  @Post('revision-requests/:id/reject')
  @UseGuards(RolesGuard)
  @Roles(ROLES.admin)
  reject(@Param('id') id: string, @Body() body: ReviewRevisionDto, @Req() request: ActorRequest) {
    return this.revisionsService.reject(Number(id), { ...body, reviewer: request.user.name });
  }
}
