# saju-fortune

Local Node.js helper for Korean 사주팔자 interview-style fortune readings in k-skill.

It mirrors the public tool model from `hjsh200219/fortuneteller` without starting or serving an MCP server. The package provides deterministic local four-pillar calculation, element balance summaries, fortune-topic guidance, and compatibility comparison for agent workflows.

```js
const { analyzeSaju } = require("saju-fortune")

const result = analyzeSaju({
  birthDate: "1990-03-15",
  birthTime: "10:30",
  gender: "male"
}, { analysisType: "fortune", fortuneType: "wealth" })
```

The result is a reading aid, not a deterministic guarantee or professional advice.
