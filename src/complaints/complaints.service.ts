import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateComplaintDto } from './dto/create-complaint.dto';

@Injectable()
export class ComplaintsService {
  constructor(private prisma: PrismaService) {}

  create(reporterId: string, dto: CreateComplaintDto) {
    return this.prisma.complaint.create({
      data: {
        reporterId,
        targetType: dto.targetType,
        targetId: dto.targetId,
        reason: dto.reason,
      },
    });
  }

  findMine(reporterId: string) {
    return this.prisma.complaint.findMany({
      where: { reporterId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
