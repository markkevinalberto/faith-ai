/**
 * FAITH AI artwork, created with Google Flow and ChatGPT image generation (see DISCLOSURES.md).
 * Every image is a transparent cut-out, so it can sit on any background or overlap a card edge.
 * Mascot poses come from the character sheet; the medication, glucose and reminder pictures add a
 * prop (plus badge, glucose meter, bell) cut from the design board beside a sheet pose. Replace any
 * PNG in assets/illustrations with a higher-resolution export of the same name and update its size.
 */
import { Image } from 'expo-image';
import type { StyleProp, ViewStyle } from 'react-native';

const ART = {
  'mascot-hero': { src: require('../../assets/illustrations/mascot-hero.png'), w: 291, h: 404 },
  'mascot-standing': { src: require('../../assets/illustrations/mascot-standing.png'), w: 219, h: 575 },
  'mascot-celebrating': { src: require('../../assets/illustrations/mascot-celebrating.png'), w: 232, h: 364 },
  'mascot-cheering': { src: require('../../assets/illustrations/mascot-cheering.png'), w: 196, h: 366 },
  'mascot-thinking': { src: require('../../assets/illustrations/mascot-thinking.png'), w: 216, h: 358 },
  'mascot-encouragement': { src: require('../../assets/illustrations/mascot-encouragement.png'), w: 240, h: 364 },
  'mascot-surprised': { src: require('../../assets/illustrations/mascot-surprised.png'), w: 199, h: 365 },
  'mascot-caring': { src: require('../../assets/illustrations/mascot-caring.png'), w: 180, h: 358 },
  'mascot-health-education': { src: require('../../assets/illustrations/mascot-health-education.png'), w: 198, h: 356 },
  'mascot-medication-reminder': { src: require('../../assets/illustrations/mascot-medication-reminder.png'), w: 284, h: 399 },
  'onboard-add-medication': { src: require('../../assets/illustrations/onboard-add-medication.png'), w: 364, h: 400 },
  'onboard-record-glucose': { src: require('../../assets/illustrations/onboard-record-glucose.png'), w: 315, h: 398 },
  'status-secure-storage': { src: require('../../assets/illustrations/status-secure-storage.png'), w: 101, h: 127 },
  'feature-shield': { src: require('../../assets/illustrations/feature-shield.png'), w: 121, h: 136 },
  'feature-ai-globe': { src: require('../../assets/illustrations/feature-ai-globe.png'), w: 112, h: 146 },
  'feature-bell': { src: require('../../assets/illustrations/feature-bell.png'), w: 121, h: 106 },
  'feature-offline': { src: require('../../assets/illustrations/feature-offline.png'), w: 78, h: 66 },
} as const;

export type IllustrationName = keyof typeof ART;

/** Width of an illustration drawn at `height`, from its aspect ratio. */
export function illustrationWidth(name: IllustrationName, height: number): number {
  const art = ART[name];
  return Math.round((height * art.w) / art.h);
}

/**
 * Decorative by default (hidden from screen readers); pass `label` when the image carries meaning.
 * `height` sets the size; width follows the artwork's aspect ratio.
 */
export function Illustration({ name, height = 140, label, style }: { name: IllustrationName; height?: number; label?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <Image
      source={ART[name].src}
      style={[{ width: illustrationWidth(name, height), height }, style as object]}
      contentFit="contain"
      transition={120}
      accessible={!!label}
      accessibilityLabel={label}
      importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}
    />
  );
}
