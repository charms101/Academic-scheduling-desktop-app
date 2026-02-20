const fs = require('fs')
const path = require('path')

const dataPath = path.join(__dirname, '../data.json')

function loadData() {
  try {
    const raw = fs.readFileSync(dataPath, 'utf-8')
    return JSON.parse(raw)
  } catch (e) {
    return { classes: [], assignments: [], exams: [] }
  }
}

function parseLocalDate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function updateClock() {
  const dateEl = document.getElementById('current-date')
  const timeEl = document.getElementById('current-time')
  if (!dateEl || !timeEl) return

  const now = new Date()
  dateEl.textContent = now.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric'
  })
  timeEl.textContent = now.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit'
  })
}

function renderClasses(data) {
  const container = document.getElementById('todays-classes')
  const today = new Date().toLocaleDateString('en-US', { weekday: 'short' })

  const todayClasses = data.classes.filter(c => c.days.includes(today))

  if (todayClasses.length === 0) {
    container.innerHTML = '<p class="empty">No classes today ✨</p>'
    return
  }

  container.innerHTML = todayClasses.map(c => `
    <div class="class-item">
      <div>${c.name}</div>
      <div class="time-label">${c.time}</div>
    </div>
  `).join('')
}

function renderAssignments(data) {
  const container = document.getElementById('due-soon')
  const today = new Date()

  const upcoming = data.assignments
    .filter(a => {
      const due = parseLocalDate(a.due)
      const diff = (due - today) / (1000 * 60 * 60 * 24)
      return diff >= 0 && diff <= 7
    })
    .sort((a, b) => parseLocalDate(a.due) - parseLocalDate(b.due))

  if (upcoming.length === 0) {
    container.innerHTML = '<p class="empty">Nothing due soon 🌷</p>'
    return
  }

  container.innerHTML = upcoming.map(a => {
    const due = parseLocalDate(a.due)
    const label = due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return `
      <div class="assignment-item">
        <div>${a.name}</div>
        <div class="due">Due ${label}</div>
      </div>
    `
  }).join('')
}

function renderExams(data) {
  const container = document.getElementById('exams')
  const today = new Date()

  const upcoming = data.exams
    .filter(e => {
      const examDate = parseLocalDate(e.date)
      const diff = (examDate - today) / (1000 * 60 * 60 * 24)
      return diff >= 0 && diff <= 14
    })
    .sort((a, b) => parseLocalDate(a.date) - parseLocalDate(b.date))

  if (upcoming.length === 0) {
    container.innerHTML = '<p class="empty">No upcoming exams 🍵</p>'
    return
  }

  container.innerHTML = upcoming.map(e => {
    const examDate = parseLocalDate(e.date)
    const diff = Math.ceil((examDate - today) / (1000 * 60 * 60 * 24))
    const urgent = diff <= 2
    const label = examDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return `
      <div class="exam-item ${urgent ? 'urgent' : ''}">
        <div>${e.name}</div>
        <div class="countdown">${label} at ${e.time} · ${diff} day${diff !== 1 ? 's' : ''} away</div>
      </div>
    `
  }).join('')
}

function render() {
  const data = loadData()
  renderClasses(data)
  renderAssignments(data)
  renderExams(data)
}

// clock ticks every second
setInterval(updateClock, 1000)

// data rechecks every 5 hours
setInterval(render, 18000000)

// initial load
updateClock()
render()