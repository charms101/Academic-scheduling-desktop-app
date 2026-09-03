const { app, BrowserWindow, ipcMain, screen } = require('electron') //imports apps, window and screen details
const fs = require('fs/promises')
const path = require('path')

const dataPath = path.join(__dirname, 'data.json')

function createWindow() { //a wraped fxn we can call when electron is ready
    const { width, height } = screen.getPrimaryDisplay().workAreaSize //getting monitors usable size

    const widgetWidth = 390 //how much width the app will have
    const widgetHeight = 640 //how much height the app will have

    const win = new BrowserWindow({ //creates a new window
        width: widgetWidth,
        height: widgetHeight,

        //positioning where you see your app
        x: width - widgetWidth - 40,
        y: height - widgetHeight - 20,

        frame: false, //no mac frame like red yellow button on top
        transparent: true, //window background see-through so it blends into your desktop.
        alwaysOnTop: false, //meaning your other app windows will go on top of it, just like a wallpaper widget.
        hasShadow: false, //Removes the macOS drop shadow around the window so it looks cleaner
        resizable: false, //Prevents you from accidentally resizing it by dragging the edges.

        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            //nppreload: path.join(__dirname, 'src/renderer.js')
        }
    })

    win.loadFile('src/index.html')
    //win.webContents.openDevTools({ mode: 'detach' })  // add this line
    win.setVisibleOnAllWorkspaces(true)

}

async function readDashboardData() {
    try {
        const raw = await fs.readFile(dataPath, 'utf-8')
        return JSON.parse(raw)
    } catch (error) {
        return { classes: [], assignments: [], exams: [] }
    }
}

async function writeDashboardData(data) {
    await fs.writeFile(dataPath, `${JSON.stringify(data, null, 2)}\n`)
    return data
}

function normalizeText(value) {
    return String(value || '').trim()
}

function extractCourseCode(text) {
    const match = normalizeText(text).match(/\b([A-Z]{2,5})\s*-?\s*(\d{3,4})\b/i)
    if (!match) return ''
    return `${match[1].toUpperCase()} ${match[2]}`
}

function normalizeDate(value) {
    const text = normalizeText(value)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return ''
    return text
}

function normalizeDays(days) {
    const validDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    if (!Array.isArray(days)) return []
    return days
        .map(day => normalizeText(day).slice(0, 3))
        .map(day => day.charAt(0).toUpperCase() + day.slice(1).toLowerCase())
        .filter(day => validDays.includes(day))
}

function normalizeImportedData(raw) {
    const data = raw && typeof raw === 'object' ? raw : {}

    const classes = Array.isArray(data.classes) ? data.classes.map(item => ({
        name: normalizeText(item.name),
        days: normalizeDays(item.days),
        time: normalizeText(item.time)
    })).filter(item => item.name) : []

    const assignments = Array.isArray(data.assignments) ? data.assignments.map(item => ({
        name: normalizeText(item.name),
        due: normalizeDate(item.due)
    })).filter(item => item.name && item.due) : []

    const exams = Array.isArray(data.exams) ? data.exams.map(item => ({
        name: normalizeText(item.name),
        date: normalizeDate(item.date),
        time: normalizeText(item.time)
    })).filter(item => item.name && item.date) : []

    return { classes, assignments, exams }
}

function itemKey(item) {
    return JSON.stringify(item)
}

function mergeDashboardData(existing, imported) {
    const mergeList = (left, right) => {
        const seen = new Set()
        return [...left, ...right].filter(item => {
            const key = itemKey(item)
            if (seen.has(key)) return false
            seen.add(key)
            return true
        })
    }

    return {
        classes: mergeList(existing.classes || [], imported.classes || []),
        assignments: mergeList(existing.assignments || [], imported.assignments || []),
        exams: mergeList(existing.exams || [], imported.exams || [])
    }
}

function parseDateFromText(text) {
    const currentYear = new Date().getFullYear()
    const monthNames = {
        jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
        apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
        aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10,
        october: 10, nov: 11, november: 11, dec: 12, december: 12
    }
    const iso = text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/)
    if (iso) {
        return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`
    }

    const slash = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/)
    if (slash) {
        const year = slash[3] ? (slash[3].length === 2 ? `20${slash[3]}` : slash[3]) : String(currentYear)
        return `${year}-${slash[1].padStart(2, '0')}-${slash[2].padStart(2, '0')}`
    }

    const named = text.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t)?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2})(?:,\s*(20\d{2}))?\b/i)
    if (named) {
        const month = monthNames[named[1].toLowerCase().replace('.', '')]
        const year = named[3] || String(currentYear)
        return `${year}-${String(month).padStart(2, '0')}-${named[2].padStart(2, '0')}`
    }

    const dayFirst = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t)?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)(?:,?\s*(20\d{2}))?\b/i)
    if (dayFirst) {
        const month = monthNames[dayFirst[2].toLowerCase().replace('.', '')]
        const year = dayFirst[3] || String(currentYear)
        return `${year}-${String(month).padStart(2, '0')}-${dayFirst[1].padStart(2, '0')}`
    }

    return ''
}

function parseTimeFromText(text) {
    const match = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\b/i)
    if (!match) return ''
    return `${match[1]}:${match[2] || '00'} ${match[3].toUpperCase()}`
}

function parseDaysFromText(text) {
    const found = []
    const patterns = [
        ['Mon', /\b(mon|monday)\b/i],
        ['Tue', /\b(tue|tues|tuesday)\b/i],
        ['Wed', /\b(wed|wednesday)\b/i],
        ['Thu', /\b(thu|thur|thurs|thursday)\b/i],
        ['Fri', /\b(fri|friday)\b/i],
        ['Sat', /\b(sat|saturday)\b/i],
        ['Sun', /\b(sun|sunday)\b/i]
    ]

    patterns.forEach(([day, pattern]) => {
        if (pattern.test(text)) found.push(day)
    })

    if (/\bMWF\b/i.test(text)) return ['Mon', 'Wed', 'Fri']
    if (/\bTTh\b|\bTR\b/i.test(text)) return ['Tue', 'Thu']

    return found
}

function parseSyllabusLocally(text) {
    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
    const result = { classes: [], assignments: [], exams: [] }
    const courseCodes = [...new Set(lines.map(extractCourseCode).filter(Boolean))]
    const courseLine = lines.find(line => extractCourseCode(line))

    if (courseCodes.length) {
        courseCodes.forEach(code => {
            result.classes.push({
                name: code,
                days: parseDaysFromText(text),
                time: parseTimeFromText(text)
            })
        })
    } else if (courseLine) {
        result.classes.push({
            name: courseLine.replace(/\s+/g, ' ').slice(0, 80),
            days: parseDaysFromText(text),
            time: parseTimeFromText(text)
        })
    }

    lines.forEach(line => {
        const date = parseDateFromText(line)
        if (!date) return

        const lower = line.toLowerCase()
        const courseCode = extractCourseCode(line)
        const cleanName = line.replace(/\s+/g, ' ').slice(0, 100)
        const itemName = courseCode && !cleanName.toUpperCase().includes(courseCode)
            ? `${courseCode} ${cleanName}`
            : cleanName

        if (/\b(exam|quiz|midterm|final|test)\b/.test(lower)) {
            result.exams.push({ name: itemName, date, time: parseTimeFromText(line) })
            return
        }

        if (/\b(homework|assignment|project|paper|essay|lab|milestone|due|submit|report)\b/.test(lower)) {
            result.assignments.push({ name: itemName, due: date })
        }
    })

    return normalizeImportedData(result)
}

async function extractTextFromFile(filePath) {
    if (!filePath) return ''

    const ext = path.extname(filePath).toLowerCase()
    if (ext === '.pdf') {
        const { PDFParse } = require('pdf-parse')
        const buffer = await fs.readFile(filePath)
        const parser = new PDFParse({ data: buffer })
        try {
            const result = await parser.getText()
            return result.text || ''
        } finally {
            await parser.destroy()
        }
    }

    return fs.readFile(filePath, 'utf-8')
}

async function parseSyllabusWithOpenAI(text, apiKey) {
    const today = new Date().toISOString().slice(0, 10)
    const currentYear = new Date().getFullYear()
    const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: 'gpt-5-mini',
            instructions: `Extract an academic schedule from a syllabus or short typed academic notes. Today is ${today}. Return only items explicitly present in the text. Dates must be ISO YYYY-MM-DD. If a date has no year, assume the current year is ${currentYear}. Day abbreviations must be Mon, Tue, Wed, Thu, Fri, Sat, or Sun. If a time is missing, use an empty string. When a note names a course code like CS 377, add a class item named exactly "CS 377" if no fuller class name is provided. Keep assignment and exam names close to the user wording, including the course code when present.`,
            input: text.slice(0, 120000),
            text: {
                format: {
                    type: 'json_schema',
                    name: 'academic_schedule',
                    strict: true,
                    schema: {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                            classes: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    additionalProperties: false,
                                    properties: {
                                        name: { type: 'string' },
                                        days: {
                                            type: 'array',
                                            items: { type: 'string', enum: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] }
                                        },
                                        time: { type: 'string' }
                                    },
                                    required: ['name', 'days', 'time']
                                }
                            },
                            assignments: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    additionalProperties: false,
                                    properties: {
                                        name: { type: 'string' },
                                        due: { type: 'string' }
                                    },
                                    required: ['name', 'due']
                                }
                            },
                            exams: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    additionalProperties: false,
                                    properties: {
                                        name: { type: 'string' },
                                        date: { type: 'string' },
                                        time: { type: 'string' }
                                    },
                                    required: ['name', 'date', 'time']
                                }
                            }
                        },
                        required: ['classes', 'assignments', 'exams']
                    }
                }
            }
        })
    })

    if (!response.ok) {
        const body = await response.text()
        throw new Error(`OpenAI request failed (${response.status}): ${body}`)
    }

    const body = await response.json()
    const outputText = body.output_text || body.output?.flatMap(item => item.content || [])
        .find(content => content.type === 'output_text')?.text

    if (!outputText) throw new Error('OpenAI did not return schedule JSON.')
    return normalizeImportedData(JSON.parse(outputText))
}

ipcMain.handle('parse-syllabus', async (_event, payload) => {
    const fileText = await extractTextFromFile(payload.filePath)
    const extraText = normalizeText(payload.extraText)
    const syllabusText = [fileText, extraText].filter(Boolean).join('\n\n')

    if (!syllabusText.trim()) {
        throw new Error('Choose a syllabus file or paste syllabus text first.')
    }

    if (normalizeText(payload.apiKey)) {
        try {
            const imported = await parseSyllabusWithOpenAI(syllabusText, normalizeText(payload.apiKey))
            return { imported, usedAi: true, warning: '' }
        } catch (error) {
            const imported = parseSyllabusLocally(syllabusText)
            return {
                imported,
                usedAi: false,
                warning: `${error.message} Local parser results are shown instead.`
            }
        }
    }

    return {
        imported: parseSyllabusLocally(syllabusText),
        usedAi: false,
        warning: 'No API key entered, so the local parser made a best guess.'
    }
})

ipcMain.handle('save-imported-schedule', async (_event, imported) => {
    const existing = await readDashboardData()
    const nextData = mergeDashboardData(existing, normalizeImportedData(imported))
    return writeDashboardData(nextData)
})

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
