import { Platform } from 'react-native';

import { showAlert } from '@/ui/dialog';
import { getTextSize, parseTextSize, setTextSize, textScaleOf } from '@/ui/textSize';
import { TYPE, scaleTextOverride, scaleType } from '@/ui/theme';

describe('type scale for older readers', () => {
  it('keeps every text style at 14 px or more, with 17 px body text', () => {
    for (const style of Object.values(TYPE)) expect(style.fontSize).toBeGreaterThanOrEqual(14);
    expect(TYPE.body.fontSize).toBe(17);
    expect('textTransform' in TYPE.overline).toBe(false);
  });

  it('scales sizes and line heights by the chosen text size', () => {
    expect(scaleType(1)).toBe(TYPE);
    const xl = scaleType(textScaleOf('xlarge'));
    expect(xl.body).toMatchObject({ fontSize: 22, lineHeight: 34, fontWeight: '400' });
    expect(xl.caption.fontSize).toBe(19.5);
    expect(scaleTextOverride({ fontSize: 14, lineHeight: 19 }, 1.15)).toEqual({ fontSize: 16, lineHeight: 22 });
    expect(scaleTextOverride({ color: 'red' }, 1.3)).toBeNull();
    expect(scaleTextOverride({ fontSize: 14 }, 1)).toBeNull();
  });

  it('parses and stores the text size choice', () => {
    expect(parseTextSize('large')).toBe('large');
    expect(parseTextSize('huge')).toBe('standard');
    expect(parseTextSize(null)).toBe('standard');
    setTextSize('xlarge');
    expect(getTextSize()).toBe('xlarge');
    setTextSize('standard');
    expect(getTextSize()).toBe('standard');
  });
});

describe('dialogs in the browser', () => {
  const g = globalThis as unknown as { confirm: (m: string) => boolean; alert: (m: string) => void };
  const original = { confirm: g.confirm, alert: g.alert };
  afterEach(() => {
    g.confirm = original.confirm;
    g.alert = original.alert;
  });

  it('runs on the web build', () => {
    expect(Platform.OS).toBe('web');
  });

  it('turns a Cancel + action question into a confirm', () => {
    const remove = jest.fn();
    const cancel = jest.fn();
    g.confirm = jest.fn(() => true);
    showAlert('Delete this reading?', 'It will be permanently removed.', [
      { text: 'Cancel', style: 'cancel', onPress: cancel },
      { text: 'Delete', style: 'destructive', onPress: remove },
    ]);
    expect(g.confirm).toHaveBeenCalledWith('Delete this reading?\n\nIt will be permanently removed.');
    expect(remove).toHaveBeenCalledTimes(1);
    expect(cancel).not.toHaveBeenCalled();

    g.confirm = jest.fn(() => false);
    showAlert('Delete this reading?', undefined, [
      { text: 'Cancel', style: 'cancel', onPress: cancel },
      { text: 'Delete', style: 'destructive', onPress: remove },
    ]);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('shows plain messages with alert', () => {
    g.alert = jest.fn();
    const ok = jest.fn();
    showAlert("Couldn't save", 'Some details were not valid.');
    showAlert('Deleted', undefined, [{ text: 'OK', onPress: ok }]);
    expect(g.alert).toHaveBeenNthCalledWith(1, "Couldn't save\n\nSome details were not valid.");
    expect(g.alert).toHaveBeenNthCalledWith(2, 'Deleted');
    expect(ok).toHaveBeenCalledTimes(1);
  });
});
