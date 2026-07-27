import { describe, it, expect } from 'vitest';
import {
  stripHtmlTags,
  sanitizeValue,
  sanitizeObject,
} from '../../../utils/sanitize.js';

describe('sanitize utilities', () => {
  describe('stripHtmlTags', () => {
    it('should remove simple HTML tags', () => {
      expect(stripHtmlTags('Hello <b>world</b>')).toBe('Hello world');
    });

    it('should remove tags with attributes', () => {
      expect(stripHtmlTags('<a href="http://example.com">link</a>')).toBe('link');
    });

    it('should remove self-closing tags', () => {
      expect(stripHtmlTags('before<br/>after')).toBe('beforeafter');
      expect(stripHtmlTags('before<img src="x.png" />after')).toBe('beforeafter');
    });

    it('should handle nested tags', () => {
      expect(stripHtmlTags('<div><span>text</span></div>')).toBe('text');
    });

    it('should strip script tags and preserve inner text', () => {
      expect(stripHtmlTags("<script>alert('xss')</script>")).toBe("alert('xss')");
    });

    it('should return empty string for empty input', () => {
      expect(stripHtmlTags('')).toBe('');
    });

    it('should return empty string for null/undefined', () => {
      expect(stripHtmlTags(null as unknown as string)).toBe('');
      expect(stripHtmlTags(undefined as unknown as string)).toBe('');
    });

    it('should preserve text without HTML tags', () => {
      expect(stripHtmlTags('plain text')).toBe('plain text');
    });

    it('should handle multiple tags in sequence', () => {
      expect(stripHtmlTags('<p>one</p><p>two</p>')).toBe('onetwo');
    });

    it('should strip content between angle brackets aggressively', () => {
      // The regex strips anything matching <...> pattern for security
      expect(stripHtmlTags('5 < 3 > 2')).toBe('5  2');
    });
  });

  describe('sanitizeValue', () => {
    it('should strip HTML tags and trim whitespace', () => {
      expect(sanitizeValue('  <b>hello</b>  ')).toBe('hello');
    });

    it('should return empty string for null/undefined', () => {
      expect(sanitizeValue(null as unknown as string)).toBe('');
      expect(sanitizeValue(undefined as unknown as string)).toBe('');
    });

    it('should trim whitespace-only strings', () => {
      expect(sanitizeValue('   ')).toBe('');
    });

    it('should handle strings with only tags', () => {
      expect(sanitizeValue('<div></div>')).toBe('');
    });

    it('should preserve Persian text', () => {
      expect(sanitizeValue('سلام دنیا')).toBe('سلام دنیا');
    });
  });

  describe('sanitizeObject', () => {
    it('should sanitize string values in flat object', () => {
      const input = { name: '<b>Ali</b>', age: 30 };
      const result = sanitizeObject(input);
      expect(result).toEqual({ name: 'Ali', age: 30 });
    });

    it('should recursively sanitize nested objects', () => {
      const input = {
        user: {
          name: '<script>xss</script>',
          bio: '  <p>hello</p>  ',
        },
      };
      const result = sanitizeObject(input);
      expect(result).toEqual({
        user: {
          name: 'xss',
          bio: 'hello',
        },
      });
    });

    it('should sanitize string elements in arrays', () => {
      const input = { tags: ['<b>one</b>', '<i>two</i>'], count: 2 };
      const result = sanitizeObject(input);
      expect(result).toEqual({ tags: ['one', 'two'], count: 2 });
    });

    it('should handle nested arrays with objects', () => {
      const input = {
        items: [
          { label: '<div>item1</div>' },
          { label: '<span>item2</span>' },
        ],
      };
      const result = sanitizeObject(input);
      expect(result).toEqual({
        items: [
          { label: 'item1' },
          { label: 'item2' },
        ],
      });
    });

    it('should leave non-string primitives unchanged', () => {
      const input = {
        num: 42,
        bool: true,
        nil: null,
        str: '<b>text</b>',
      };
      const result = sanitizeObject(input);
      expect(result).toEqual({
        num: 42,
        bool: true,
        nil: null,
        str: 'text',
      });
    });

    it('should handle empty object', () => {
      expect(sanitizeObject({})).toEqual({});
    });
  });
});
