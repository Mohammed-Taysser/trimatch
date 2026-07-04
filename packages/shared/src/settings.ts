import { z } from 'zod';

// Settings framework (869e01dmv). A setting's value is polymorphic (bool/number/
// string) and validated server-side against the code registry, so the transport
// schema keeps it opaque.
export const SettingViewSchema = z.object({
  key: z.string(),
  value: z.unknown(),
  default: z.unknown(),
  description: z.string(),
});
export type SettingView = z.infer<typeof SettingViewSchema>;
export const SettingListSchema = z.array(SettingViewSchema);

export const SettingUpdateSchema = z.object({
  value: z.unknown(),
});
export type SettingUpdate = z.infer<typeof SettingUpdateSchema>;
