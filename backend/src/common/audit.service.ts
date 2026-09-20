import { Injectable } from '@nestjs/common';
import { DatabaseService, QueryExecutor } from './database.service';

@Injectable()
export class AuditService {
  constructor(private readonly database: DatabaseService) {}

  // 允许传入事务执行器，使审计记录与业务变更处于同一事务、同生共死。
  async log(actor: string, action: string, target: string, executor: QueryExecutor = this.database): Promise<void> {
    await executor.query(
      'INSERT INTO audit_logs (actor, action, target) VALUES ($1, $2, $3)',
      [actor, action, target],
    );
  }
}
