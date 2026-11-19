// David's UX fix 8 (19 Nov 2026): finishing a day feels like a win.
const fs = require('fs');
const path = require('path');
const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8').replace(/\r\n/g, '\n');
const STORY = read('src', 'screens', 'MyStoryScreen.js');
const CARD  = read('src', 'components', 'StoryCard.js');
const done = STORY.slice(STORY.indexOf('Fix 8 (19 Nov 2026): finishing a day'), STORY.indexOf('</KeyboardAvoidingView>'));

describe('the "Day N done" screen', () => {
  test('headline with the real day number, streak and all-time count', () => {
    expect(done).toMatch(/`Day \$\{dayNumber\} of 30 done`/);
    expect(done).toMatch(/LABELS\.streak\} \{show\(doneNums\?\.streak\)\}/);
    expect(done).toMatch(/show\(doneNums\?\.lifetime\)\} \{LABELS\.lifetime\.toLowerCase\(\)\}/);
    expect(STORY).toMatch(/loadMyNumbers\(extractPhone\(data\?\.user\?\.email\), todayStr\(\)\)/);
  });
  test('small tree with the new leaf', () => {
    expect(done).toMatch(/treeForCount\(doneNums\?\.lifetime \|\| 0\)/);
    expect(done).toContain('🍃 +1 leaf');
  });
  test('story with an Edit link; Delete is on the edit screen, not here', () => {
    expect(done).toMatch(/onPress=\{startEdit\}/);
    expect(done).toMatch(/>Edit</);
    expect(done).not.toContain('Delete this act');
    const editPart = STORY.slice(STORY.indexOf('{editingId ? ('), STORY.indexOf('Fix 8 (19 Nov 2026): finishing a day'));
    expect(editPart).toContain('Delete this act');
  });
  test('one share button instead of seven', () => {
    expect(done).not.toContain('<ShareButtons');
    expect(done.match(/Share as a card/g)).toHaveLength(1);
    expect(done).toMatch(/onPress=\{handleShareAll\}/);
  });
  test('the card shows day, story, app name and invite link - no phone number', () => {
    expect(CARD).toMatch(/dayNumber/);
    expect(CARD).toMatch(/30 Acts of Kindness/);
    expect(CARD).toMatch(/inviteUrl/);
    expect(CARD).not.toMatch(/phone/i);
  });
  test('one main button: Done', () => {
    expect(done).toMatch(/<Text style=\{s\.doneBtnText\}>Done<\/Text>/);
  });
});
