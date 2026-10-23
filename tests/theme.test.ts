import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

test("a single dark Blush theme uses all upstream required color tokens", () => {
  const theme=JSON.parse(readFileSync(new URL("../themes/pi-style-blush.json",import.meta.url),"utf8"));
  assert.equal(theme.name,"pi-style-blush");
  assert.equal(theme.appearance,"dark");
  const required=[
    "accent","border","borderAccent","borderMuted","success","error","warning","muted","dim","text",
    "thinkingText","selectedBg","userMessageBg","userMessageText","customMessageBg",
    "customMessageText","customMessageLabel","toolPendingBg","toolSuccessBg","toolErrorBg",
    "toolTitle","toolOutput","mdHeading","mdLink","mdLinkUrl","mdCode","mdCodeBlock",
    "mdCodeBlockBorder","mdQuote","mdQuoteBorder","mdHr","mdListBullet","toolDiffAdded",
    "toolDiffRemoved","toolDiffContext","syntaxComment","syntaxKeyword","syntaxFunction",
    "syntaxVariable","syntaxString","syntaxNumber","syntaxType","syntaxOperator",
    "syntaxPunctuation","thinkingOff","thinkingMinimal","thinkingLow","thinkingMedium",
    "thinkingHigh","thinkingXhigh","bashMode",
  ];
  for(const key of required) assert.ok(theme.colors[key],key);
  for(const value of Object.values(theme.colors) as string[]) {
    assert.ok(value.startsWith("#") || Object.hasOwn(theme.vars,value),`unknown color reference: ${value}`);
  }
  assert.ok(theme.export.pageBg && theme.export.cardBg);
});

test("Pi package manifests exactly one theme", () => {
  const packageJson=JSON.parse(readFileSync(new URL("../package.json",import.meta.url),"utf8"));
  assert.deepEqual(packageJson.pi.themes,["./themes/pi-style-blush.json"]);
});
