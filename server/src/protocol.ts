import { z } from "zod";

const SuitSchema = z.enum(["oros", "copas", "espadas", "bastos"]);
const ModeSchema = z.enum(["tresillo", "quadrille"]);
const StakeModeSchema = z.enum(["free", "tokens"]);
const BidSchema = z.enum([
  "pass", "entrada", "oros", "volteo", "solo", "solo_oros", "bola", "contrabola",
]);
const SeatSchema = z.number().int().min(0).max(3);

export const C2SMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("QUICK_PLAY"),
    mode: ModeSchema,
    stakeMode: StakeModeSchema.optional(),
  }),
  z.object({
    type: z.literal("CREATE_ROOM"),
    mode: ModeSchema,
    stakeMode: StakeModeSchema.optional(),
    target: z.number().int().min(6).max(30).optional(),
    roomName: z.string().trim().max(30).optional(),
    quickStart: z.boolean().optional(),
    rules: z
      .object({
        espadaObligatoria: z.boolean().optional(),
      })
      .optional(),
  }),
  z.object({ type: z.literal("JOIN_ROOM"), code: z.string().min(4).max(8) }),
  z.object({ type: z.literal("SPECTATE"), roomId: z.string() }),
  z.object({ type: z.literal("TAKE_SEAT"), seat: SeatSchema }),
  z.object({ type: z.literal("LEAVE_ROOM") }),
  z.object({ type: z.literal("START_GAME") }),
  z.object({
    type: z.literal("BID"),
    value: BidSchema,
    suit: SuitSchema.optional(),
  }),
  z.object({ type: z.literal("CHOOSE_TRUMP"), suit: SuitSchema }),
  z.object({
    type: z.literal("EXCHANGE"),
    discardIds: z.array(z.string()).max(9),
  }),
  z.object({ type: z.literal("EXCHANGE_DEFER") }),
  z.object({ type: z.literal("PENETRO_DECISION"), accept: z.boolean() }),
  z.object({
    type: z.literal("UPGRADE_CONTRACT"),
    value: z.union([BidSchema, z.literal("keep")]),
  }),
  z.object({ type: z.literal("CLOSE_HAND") }),
  z.object({ type: z.literal("PLAY"), cardId: z.string().min(1) }),
  z.object({ type: z.literal("REMATCH") }),
  z.object({ type: z.literal("LEAVE_QUEUE") }),
  z.object({ type: z.literal("PING") }),
]);

export type ValidatedC2SMessage = z.infer<typeof C2SMessageSchema>;
