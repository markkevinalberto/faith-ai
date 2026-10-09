/**
 * FAITH AI artwork, created with Google Flow and ChatGPT image generation (see DISCLOSURES.md).
 * Mascot poses (hero, celebrating, encouragement, thinking, health-education) are transparent
 * cut-outs from the character sheet; the rest are 2x crops from the design board. Replace any PNG
 * in assets/illustrations with a higher-resolution export of the same name and update its size here.
 */
import { Image } from 'expo-image';
import type { StyleProp, ViewStyle } from 'react-native';

const ART = {
  'mascot-hero': { src: require('../../assets/illustrations/mascot-hero.png'), w: 291, h: 404 },
  'onboard-setup-profile': { src: require('../../assets/illustrations/onboard-setup-profile.png'), w: 256, h: 244 },
  'onboard-add-medication': { src: require('../../assets/illustrations/onboard-add-medication.png'), w: 248, h: 244 },
  'onboard-record-glucose': { src: require('../../assets/illustrations/onboard-record-glucose.png'), w: 252, h: 244 },
  'mascot-celebrating': { src: require('../../assets/illustrations/mascot-celebrating.png'), w: 232, h: 364 },
  'mascot-thinking': { src: require('../../assets/illustrations/mascot-thinking.png'), w: 216, h: 358 },
  'mascot-encouragement': { src: require('../../assets/illustrations/mascot-encouragement.png'), w: 240, h: 364 },
  'mascot-empty-history': { src: require('../../assets/illustrations/mascot-empty-history.png'), w: 158, h: 214 },
  'mascot-medication-reminder': { src: require('../../assets/illustrations/mascot-medication-reminder.png'), w: 194, h: 228 },
  'mascot-health-education': { src: require('../../assets/illustrations/mascot-health-education.png'), w: 198, h: 356 },
  'mascot-offline': { src: require('../../assets/illustrations/mascot-offline.png'), w: 154, h: 214 },
  'empty-no-appointments': { src: require('../../assets/illustrations/empty-no-appointments.png'), w: 176, h: 204 },
  'empty-no-lab-tests': { src: require('../../assets/illustrations/empty-no-lab-tests.png'), w: 216, h: 204 },
  'status-secure-storage': { src: require('../../assets/illustrations/status-secure-storage.png'), w: 164, h: 204 },
  'feature-shield': { src: require('../../assets/illustrations/feature-shield.png'), w: 162, h: 176 },
  'feature-ai-globe': { src: require('../../assets/illustrations/feature-ai-globe.png'), w: 158, h: 176 },
  'feature-bell': { src: require('../../assets/illustrations/feature-bell.png'), w: 160, h: 170 },
} as const;

export type IllustrationName = keyof typeof ART;

/**
 * Decorative by default (hidden from screen readers); pass `label` when the image carries meaning.
 * `height` sets the size; width follows the artwork's aspect ratio.
 */
export function Illustration({ name, height = 140, label, style }: { name: IllustrationName; height?: number; label?: string; style?: StyleProp<ViewStyle> }) {
  const art = ART[name];
  const width = Math.round((height * art.w) / art.h);
  return (
    <Image
      source={art.src}
      style={[{ width, height, borderRadius: Math.round(height * 0.1) }, style as object]}
      contentFit="contain"
      transition={120}
      accessible={!!label}
      accessibilityLabel={label}
      importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}
    />
  );
}
