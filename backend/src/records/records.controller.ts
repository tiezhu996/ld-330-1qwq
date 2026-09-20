import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  CreatePatientDto,
  RecordsService,
  ReviewRevisionDto,
  RevisionContentDto,
} from './records.service';

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

  // 时间轴：回读病历各版本及修订申请的审批结果。
  @Get('patients/:id/timeline')
  timeline(@Param('id') id: string) {
    return this.recordsService.timeline(Number(id));
  }

  @Post('patients/:id/records')
  createRecord(@Param('id') id: string) {
    return this.recordsService.createRecord(Number(id));
  }

  // 医生直接编辑病历：已归档病历会被拒绝并引导走修订申请。
  @Patch('records/:id/content')
  updateContent(@Param('id') id: string, @Body() body: RevisionContentDto) {
    return this.recordsService.updateRecordContent(Number(id), body);
  }

  // 管理员审签归档。
  @Post('records/:id/archive')
  archive(@Param('id') id: string, @Body() body: ReviewRevisionDto) {
    return this.recordsService.archiveRecord(Number(id), body?.reviewer);
  }

  // 医生对已归档病历提交修订申请（原因 + 新主诉/诊断/治疗方案）。
  @Post('records/:id/revisions')
  createRevision(@Param('id') id: string, @Body() body: RevisionContentDto) {
    return this.recordsService.createRevision(Number(id), body);
  }

  // 管理员修订审批队列，默认只看待审批。
  @Get('revisions')
  listRevisions(@Query('status') status?: string) {
    return this.recordsService.listRevisions(status);
  }

  // 批准：同一事务生成新版本并将旧版留档。
  @Post('revisions/:id/approve')
  approve(@Param('id') id: string, @Body() body: ReviewRevisionDto) {
    return this.recordsService.approveRevision(Number(id), body ?? {});
  }

  // 驳回：保留原文，写入审批意见。
  @Post('revisions/:id/reject')
  reject(@Param('id') id: string, @Body() body: ReviewRevisionDto) {
    return this.recordsService.rejectRevision(Number(id), body ?? {});
  }
}
