import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { CatalogModule } from "./catalog/catalog.module";
import { CommerceModule } from "./commerce/commerce.module";
import { EditorialModule } from "./editorial/editorial.module";
import { EngagementModule } from "./engagement/engagement.module";
import { HealthModule } from "./health/health.module";
import { InventoryModule } from "./inventory/inventory.module";
import { PrismaModule } from "./prisma/prisma.module";
import { ServicesModule } from "./services/services.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    UsersModule,
    HealthModule,
    InventoryModule,
    CatalogModule,
    EngagementModule,
    CommerceModule,
    ServicesModule,
    EditorialModule,
  ],
})
export class AppModule {}
