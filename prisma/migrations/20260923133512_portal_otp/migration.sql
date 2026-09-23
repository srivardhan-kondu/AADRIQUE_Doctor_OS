-- CreateTable
CREATE TABLE "PortalOtp" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalOtp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PortalOtp_organizationId_phone_createdAt_idx" ON "PortalOtp"("organizationId", "phone", "createdAt");

-- AddForeignKey
ALTER TABLE "PortalOtp" ADD CONSTRAINT "PortalOtp_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
