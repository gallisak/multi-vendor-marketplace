import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiConflictResponse, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Public, Roles } from '../../common/auth/decorators.js';
import { Role } from '../../generated/prisma/enums.js';
import {
  CategoryDto,
  CategoryTreeDto,
  CreateCategoryDto,
  UpdateCategoryDto,
} from './categories.dto.js';
import { CategoriesService } from './categories.service.js';

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Public()
  @Get()
  @ApiOkResponse({ type: [CategoryTreeDto] })
  tree() {
    return this.categories.tree();
  }
}

@ApiTags('admin')
@Roles(Role.ADMIN)
@Controller('admin/categories')
export class AdminCategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Post()
  @ApiCreatedResponse({ type: CategoryDto })
  @ApiConflictResponse({ description: 'Slug already exists' })
  create(@Body() dto: CreateCategoryDto) {
    return this.categories.create(dto);
  }

  @Patch(':id')
  @ApiOkResponse({ type: CategoryDto })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCategoryDto) {
    return this.categories.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiConflictResponse({ description: 'Category has subcategories or products' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.categories.remove(id);
  }
}
