
import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';

@Injectable()
export class AppService {
  constructor(private readonly em: EntityManager) { }

  getHello(): string {
    return 'Hello World!';
  }

  async testDatabase() {
    const result = await this.em.getConnection().execute(
      'SELECT 1 AS result',
    );

    return {
      status: 'connected',
      database: 'PostgreSQL',
      query: result,
    };
  }
}
