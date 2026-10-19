import { Module } from '@nestjs/common';
import { AdminCategoriesController, CategoriesController } from './categories.controller.js';
import { CategoriesRepository } from './categories.repository.js';
import { CategoriesService } from './categories.service.js';

@Module({
  controllers: [CategoriesController, AdminCategoriesController],
  providers: [CategoriesService, CategoriesRepository],
  exports: [CategoriesService],
})
export class CategoriesModule {}
