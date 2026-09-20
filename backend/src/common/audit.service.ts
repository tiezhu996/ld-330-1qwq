import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from './database.service';

@Injectable()
export class AuditService {
  constructor(private readonly database: DatabaseService) {}

  async log(actor: string, action: string, target: string, client?: PoolClient): Promise<void> {
    const text = 'INSERT INTO audit_logs (actor, action, target) VALUES ($1, $2, $3)';
    const params = [actor, action, target];
    if (client) {
      await client.query(text, params);
      return;
    }
    await this.database.query(text, params);
  }
}
