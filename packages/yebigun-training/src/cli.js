#!/usr/bin/env node

const {
  APPLICATION_MENUS,
  VIEW_MENUS,
  buildChromeLaunchCommand,
  diffYears,
  fetchInquiry,
  fetchTrainingInfo,
  inspectPage,
  listYears,
  getYear,
  openApplicationMenu,
  recordYear,
  textPreview,
} = require("./index")

function printHelp() {
  return writeStdout(`yebigun-training — logged-in browser session helper for https://www.yebigun1.mil.kr

Commands:
  yebigun-training --help
  yebigun-training chrome-command [--profile-dir DIR] [--debugging-port PORT] [--chrome-path PATH]
  yebigun-training inspect [--cdp-url URL] [--path PATH] [--full]
  yebigun-training training-info [--cdp-url URL] [--path PATH]
  yebigun-training open-menu --menu selfSelect|nationalUnit|holiday|delay|hold|holdCancel|editProfile|honors [--cdp-url URL]
  yebigun-training view --menu applicationResults|delayResults|holdResults|holidaySchedule|unitNotices|trainingNotices|myQna|unitFinder [--cdp-url URL]
  yebigun-training record --year YYYY --json '<json>'
  yebigun-training history [--year YYYY]
  yebigun-training diff --year YYYY [--compare-year YYYY]

Notes:
- This workflow only supports a logged-in browser session. It never automates PASS/공동인증서/간편인증/ID-PW login.
- Read-only: it never submits 훈련 연기/보류·해소/훈련일정 자율선택 신청 forms, and never edits 개인정보.
- training-info fetches the IvdTraScheDetail.do page and returns this year's training, prior
  years already shown on the same page, and a comparison against last year.
- view fetches a read-only 조회 list page (a generic headers+rows table) — for menus with no
  sensitive identifiers in the markup. Use this for things like 훈련신청 결과, 소속부대 공지사항 etc.
- open-menu lands on a known screen and stops there — selfSelect/nationalUnit/holiday click the real
  button on the training-info page; the rest (delay/hold/holdCancel/editProfile/honors) navigate
  directly to their own URL. These are routed here instead of view because their markup embeds
  direct identifiers (이름/군번/주민등록번호 앞자리/전화번호/주소) — this skill never reads or
  returns that data, only opens the screen for the user to look at themselves.
`)
}

function parseArgs(argv) {
  const args = { _: [] }
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith("--")) {
      args._.push(token)
      continue
    }

    const key = token.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase())
    const value = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[++index] : true
    args[key] = value
  }
  return args
}

function required(args, key, description) {
  if (!args[key]) {
    throw new Error(`Missing required --${description || key}`)
  }
  return args[key]
}

function writeStdout(value) {
  return new Promise((resolve, reject) => {
    process.stdout.write(value, (error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

async function main() {
  const argv = process.argv.slice(2)
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "help") {
    await printHelp()
    return
  }

  const command = argv[0]
  const args = parseArgs(argv.slice(1))

  if (command === "chrome-command") {
    await writeStdout(
      `${buildChromeLaunchCommand({
        chromePath: args.chromePath,
        profileDir: args.profileDir,
        debuggingPort: args.debuggingPort
      })}\n`,
    )
    return
  }

  if (command === "inspect") {
    const result = await inspectPage({ cdpUrl: args.cdpUrl, path: args.path })
    const output = {
      url: result.url,
      title: result.title,
      pageInfo: result.pageInfo,
      htmlLength: result.html.length,
      textPreview: textPreview(result.html),
      html: args.full ? result.html : undefined
    }
    await writeStdout(`${JSON.stringify(output, null, 2)}\n`)
    return
  }

  if (command === "training-info") {
    const result = await fetchTrainingInfo({ cdpUrl: args.cdpUrl, path: args.path })
    await writeStdout(`${JSON.stringify(result, null, 2)}\n`)
    return
  }

  if (command === "view") {
    const menu = required(args, "menu", `menu (one of: ${Object.keys(VIEW_MENUS).join(", ")})`)
    const result = await fetchInquiry(menu, { cdpUrl: args.cdpUrl })
    await writeStdout(`${JSON.stringify(result, null, 2)}\n`)
    return
  }

  if (command === "open-menu") {
    const menu = required(args, "menu", `menu (one of: ${Object.keys(APPLICATION_MENUS).join(", ")})`)
    const result = await openApplicationMenu(menu, { cdpUrl: args.cdpUrl })
    await writeStdout(`${JSON.stringify(result, null, 2)}\n`)
    return
  }

  if (command === "record") {
    const year = required(args, "year", "year YYYY")
    const data = JSON.parse(required(args, "json", "json '<data>'"))
    const result = recordYear(year, data)
    await writeStdout(`${JSON.stringify(result, null, 2)}\n`)
    return
  }

  if (command === "history") {
    if (args.year) {
      await writeStdout(`${JSON.stringify(getYear(args.year), null, 2)}\n`)
      return
    }
    await writeStdout(`${JSON.stringify(listYears(), null, 2)}\n`)
    return
  }

  if (command === "diff") {
    const year = required(args, "year", "year YYYY")
    const compareYear = args.compareYear || String(Number(year) - 1)
    const result = diffYears(year, compareYear)
    await writeStdout(`${JSON.stringify(result, null, 2)}\n`)
    return
  }

  throw new Error(`Unsupported command: ${command}`)
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error.message || error)
    process.exit(1)
  },
)
