-- AlterEnum
BEGIN;
CREATE TYPE "AIActionType_new" AS ENUM ('PATIENT_SUMMARY', 'PRE_CONSULTATION_BRIEF', 'CONSULTATION_NOTE_DRAFT', 'FOLLOW_UP_MESSAGE', 'HISTORY_SEARCH', 'KNOWLEDGE_ANSWER', 'MISSING_DOCUMENTATION');
ALTER TABLE "AIAction" ALTER COLUMN "type" TYPE "AIActionType_new" USING ("type"::text::"AIActionType_new");
ALTER TYPE "AIActionType" RENAME TO "AIActionType_old";
ALTER TYPE "AIActionType_new" RENAME TO "AIActionType";
DROP TYPE "public"."AIActionType_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "CommunicationCampaign" DROP CONSTRAINT "CommunicationCampaign_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT "Message_campaignId_fkey";

-- AlterTable
ALTER TABLE "Message" DROP COLUMN "campaignId";

-- DropTable
DROP TABLE "CommunicationCampaign";

-- DropEnum
DROP TYPE "CampaignStatus";

