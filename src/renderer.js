const { ipcRenderer, webUtils } = require('electron')
const fs = require('fs')
const path = require('path')

const dataPath = path.join(__dirname, '../data.json')
const screenTitles = {
  dashboard: 'Dashboard',
  classes: 'Classes',
  import: 'Import Syllabus',
  review: 'Review Results',
  'class-detail': 'Class Details',
  'edit-item': 'Edit Item'
}

let dashboardData = { classes: [], assignments: [], exams: [] }
let importedData = { classes: [], assignments: [], exams: [] }
let selectedClassName = ''
let editingItem = null

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

function formatDate(dateStr) {
  return parseLocalDate(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  })
}

function getDaysLabel(days) {
  return Array.isArray(days) && days.length ? days.join(', ') : 'Days not listed'
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function getClassCode(name) {
  const match = String(name || '').match(/\b[A-Z]{2,5}\s*\d{3,4}\b/i)
  return match ? match[0].replace(/\s+/g, ' ').toUpperCase() : ''
}

function itemBelongsToClass(itemName, className) {
  const code = getClassCode(className)
  return code && String(itemName || '').toUpperCase().includes(code)
}

function parseStartMinutes(timeText) {
  const match = String(timeText || '').match(/\b(\d{1,2})(?:[:h](\d{2}))?\s*(am|pm)\b/i)
  if (!match) return Number.MAX_SAFE_INTEGER

  let hours = Number(match[1])
  const minutes = Number(match[2] || 0)
  const period = match[3].toLowerCase()

  if (period === 'pm' && hours !== 12) hours += 12
  if (period === 'am' && hours === 12) hours = 0

  return hours * 60 + minutes
}

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.toggle('active', screen.id === `${name}-screen`)
  })

  document.querySelectorAll('.tab-button').forEach(button => {
    button.classList.toggle('active', button.dataset.screen === name)
  })

  const title = document.getElementById('screen-title')
  if (title) title.textContent = screenTitles[name] || 'Dashboard'
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
  const todayClasses = data.classes
    .filter(c => Array.isArray(c.days) && c.days.includes(today))
    .sort((a, b) => parseStartMinutes(a.time) - parseStartMinutes(b.time))

  if (todayClasses.length === 0) {
    container.innerHTML = '<p class="empty">No classes today</p>'
    return
  }

  container.innerHTML = todayClasses.map(c => `
    <div class="class-item">
      <strong>${escapeHtml(c.name)}</strong>
      <div class="time-label">${escapeHtml(c.time || 'Time not listed')}</div>
    </div>
  `).join('')
}

function getUpcomingAssignments(data) {
  const today = new Date()
  return data.assignments
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => {
      const due = parseLocalDate(item.due)
      const diff = (due - today) / (1000 * 60 * 60 * 24)
      return diff >= -1 && diff <= 7
    })
    .sort((a, b) => parseLocalDate(a.item.due) - parseLocalDate(b.item.due))
}

function getUpcomingExams(data) {
  const today = new Date()
  return data.exams
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => {
      const examDate = parseLocalDate(item.date)
      const diff = (examDate - today) / (1000 * 60 * 60 * 24)
      return diff >= -1
    })
    .sort((a, b) => parseLocalDate(a.item.date) - parseLocalDate(b.item.date))
}

function attachEditCardEvents(container) {
  container.querySelectorAll('[data-edit-type]').forEach(card => {
    card.addEventListener('click', () => {
      openEditItem(card.dataset.editType, Number(card.dataset.editIndex))
    })
  })
}

function openEditItem(type, index) {
  const item = dashboardData[type]?.[index]
  if (!item) return

  editingItem = { type, index }
  const isExam = type === 'exams'
  document.getElementById('edit-item-heading').textContent = isExam ? 'Edit Exam' : 'Edit Assignment'
  document.getElementById('edit-item-name').value = item.name || ''
  document.getElementById('edit-item-date').value = isExam ? item.date || '' : item.due || ''
  document.getElementById('edit-item-time').value = isExam ? item.time || '' : ''
  document.getElementById('edit-item-time').previousElementSibling.style.display = isExam ? 'block' : 'none'
  document.getElementById('edit-item-time').style.display = isExam ? 'block' : 'none'
  document.getElementById('edit-item-status').textContent = ''
  document.getElementById('edit-item-status').classList.remove('error')
  showScreen('edit-item')
}

async function saveEditedItem() {
  if (!editingItem) return

  const isExam = editingItem.type === 'exams'
  const name = document.getElementById('edit-item-name').value.trim()
  const date = document.getElementById('edit-item-date').value
  const time = document.getElementById('edit-item-time').value.trim()
  const status = document.getElementById('edit-item-status')

  if (!name || !date) {
    status.textContent = 'Name and date are required.'
    status.classList.add('error')
    return
  }

  const item = isExam ? { name, date, time } : { name, due: date }

  try {
    const saved = await ipcRenderer.invoke('update-schedule-item', {
      type: editingItem.type,
      index: editingItem.index,
      item
    })
    dashboardData = saved
    editingItem = null
    render()
    showScreen('dashboard')
  } catch (error) {
    status.textContent = `Could not save: ${error.message}`
    status.classList.add('error')
  }
}

function cancelEditItem() {
  editingItem = null
  showScreen('dashboard')
}

function renderAssignments(data) {
  const container = document.getElementById('due-soon')
  const upcoming = getUpcomingAssignments(data)

  if (upcoming.length === 0) {
    container.innerHTML = '<p class="empty">Nothing due soon</p>'
    return
  }

  container.innerHTML = upcoming.map(({ item, index }) => `
    <button class="assignment-item editable-card" data-edit-type="assignments" data-edit-index="${index}">
      <strong>${escapeHtml(item.name)}</strong>
      <div class="due">Due ${escapeHtml(formatDate(item.due))}</div>
    </button>
  `).join('')

  attachEditCardEvents(container)
}

function renderExams(data) {
  const container = document.getElementById('exams')
  const today = new Date()
  const upcoming = getUpcomingExams(data)

  if (upcoming.length === 0) {
    container.innerHTML = '<p class="empty">No upcoming exams</p>'
    return
  }

  container.innerHTML = upcoming.map(({ item, index }) => {
    const examDate = parseLocalDate(item.date)
    const diff = Math.max(0, Math.ceil((examDate - today) / (1000 * 60 * 60 * 24)))
    const urgent = diff <= 2
    return `
      <button class="exam-item editable-card ${urgent ? 'urgent' : ''}" data-edit-type="exams" data-edit-index="${index}">
        <strong>${escapeHtml(item.name)}</strong>
        <div class="countdown">${escapeHtml(formatDate(item.date))}${item.time ? ` at ${escapeHtml(item.time)}` : ''} · ${diff} day${diff !== 1 ? 's' : ''} away</div>
      </button>
    `
  }).join('')

  attachEditCardEvents(container)
}

function renderClassList(data) {
  const container = document.getElementById('class-list')
  if (!data.classes.length) {
    container.innerHTML = '<p class="empty">No classes saved yet</p>'
    return
  }

  const sortedClasses = data.classes
    .map((classItem, index) => ({ classItem, index }))
    .sort((a, b) => parseStartMinutes(a.classItem.time) - parseStartMinutes(b.classItem.time))

  container.innerHTML = sortedClasses.map(({ classItem, index }) => `
    <button class="class-card" data-class-index="${index}">
      <strong>${escapeHtml(classItem.name)}</strong>
      <div class="meta">${escapeHtml(getDaysLabel(classItem.days))}${classItem.time ? ` · ${escapeHtml(classItem.time)}` : ''}</div>
    </button>
  `).join('')

  container.querySelectorAll('.class-card').forEach(button => {
    button.addEventListener('click', () => renderClassDetail(Number(button.dataset.classIndex)))
  })
}

function renderClassDetail(index) {
  const classItem = dashboardData.classes[index]
  if (!classItem) return

  selectedClassName = classItem.name
  document.getElementById('detail-class-name').textContent = classItem.name
  document.getElementById('detail-class-time').textContent =
    `${getDaysLabel(classItem.days)}${classItem.time ? ` · ${classItem.time}` : ''}`

  document.getElementById('detail-meetings').innerHTML = `
    <div class="detail-pill">
      <strong>${escapeHtml(getDaysLabel(classItem.days))}</strong>
      <div class="meta">${escapeHtml(classItem.time || 'Time not listed')}</div>
    </div>
  `

  const assignments = dashboardData.assignments
    .map((item, originalIndex) => ({ item, originalIndex }))
    .filter(({ item }) => itemBelongsToClass(item.name, classItem.name))
    .sort((a, b) => parseLocalDate(a.item.due) - parseLocalDate(b.item.due))

  const exams = dashboardData.exams
    .map((item, originalIndex) => ({ item, originalIndex }))
    .filter(({ item }) => itemBelongsToClass(item.name, classItem.name))
    .sort((a, b) => parseLocalDate(a.item.date) - parseLocalDate(b.item.date))

  document.getElementById('detail-assignments').innerHTML = assignments.length
    ? assignments.map(({ item, originalIndex }) => `
      <button class="assignment-item editable-card" data-edit-type="assignments" data-edit-index="${originalIndex}">
        <strong>${escapeHtml(item.name)}</strong>
        <div class="due">Due ${escapeHtml(formatDate(item.due))}</div>
      </button>
    `).join('')
    : '<p class="empty">No assignments matched to this class</p>'

  document.getElementById('detail-exams').innerHTML = exams.length
    ? exams.map(({ item, originalIndex }) => `
      <button class="exam-item editable-card" data-edit-type="exams" data-edit-index="${originalIndex}">
        <strong>${escapeHtml(item.name)}</strong>
        <div class="countdown">${escapeHtml(formatDate(item.date))}${item.time ? ` at ${escapeHtml(item.time)}` : ''}</div>
      </button>
    `).join('')
    : '<p class="empty">No exams matched to this class</p>'

  attachEditCardEvents(document.getElementById('detail-assignments'))
  attachEditCardEvents(document.getElementById('detail-exams'))
  showScreen('class-detail')
}

async function deleteSelectedClass() {
  if (!selectedClassName) return

  const shouldDelete = window.confirm(`Delete ${selectedClassName} and its matched assignments/exams?`)
  if (!shouldDelete) return

  try {
    const saved = await ipcRenderer.invoke('delete-class', selectedClassName)
    selectedClassName = ''
    dashboardData = saved
    render()
    showScreen('classes')
  } catch (error) {
    window.alert(`Could not delete class: ${error.message}`)
  }
}

function renderReviewList(data) {
  const container = document.getElementById('review-list')
  const rows = []

  if (data.classes.length) rows.push('<h4 class="review-heading">Classes</h4>')
  data.classes.forEach((item, index) => {
    rows.push(`
      <div class="review-item" data-type="classes" data-index="${index}">
        <label>Name</label>
        <input data-field="name" value="${escapeHtml(item.name)}" />
        <label>Days</label>
        <input data-field="days" value="${escapeHtml(getDaysLabel(item.days))}" placeholder="Mon, Wed" />
        <label>Time</label>
        <input data-field="time" value="${escapeHtml(item.time)}" placeholder="9:30 AM" />
        <button class="text-button danger-button review-full" data-remove>Remove class</button>
      </div>
    `)
  })

  if (data.assignments.length) rows.push('<h4 class="review-heading">Assignments</h4>')
  data.assignments.forEach((item, index) => {
    rows.push(`
      <div class="review-item" data-type="assignments" data-index="${index}">
        <label>Task</label>
        <input data-field="name" value="${escapeHtml(item.name)}" />
        <label>Due</label>
        <input data-field="due" type="date" value="${escapeHtml(item.due)}" />
        <button class="text-button danger-button review-full" data-remove>Remove assignment</button>
      </div>
    `)
  })

  if (data.exams.length) rows.push('<h4 class="review-heading">Exams</h4>')
  data.exams.forEach((item, index) => {
    rows.push(`
      <div class="review-item" data-type="exams" data-index="${index}">
        <label>Exam</label>
        <input data-field="name" value="${escapeHtml(item.name)}" />
        <label>Date</label>
        <input data-field="date" type="date" value="${escapeHtml(item.date)}" />
        <label>Time</label>
        <input data-field="time" value="${escapeHtml(item.time)}" placeholder="12:30 PM" />
        <button class="text-button danger-button review-full" data-remove>Remove exam</button>
      </div>
    `)
  })

  container.innerHTML = rows.length ? rows.join('') : '<p class="empty">No schedule items found. Try adding more pasted text.</p>'

  container.querySelectorAll('[data-remove]').forEach(button => {
    button.addEventListener('click', () => {
      const row = button.closest('.review-item')
      importedData[row.dataset.type].splice(Number(row.dataset.index), 1)
      renderReviewList(importedData)
    })
  })
}

function readReviewData() {
  const next = { classes: [], assignments: [], exams: [] }
  document.querySelectorAll('.review-item').forEach(row => {
    const type = row.dataset.type
    const getField = field => row.querySelector(`[data-field="${field}"]`)?.value.trim() || ''
    const getDays = () => getField('days').split(/[\s,]+/).map(day => day.trim()).filter(Boolean)

    if (type === 'classes') {
      next.classes.push({
        name: getField('name'),
        days: getDays(),
        time: getField('time')
      })
    }

    if (type === 'assignments') {
      next.assignments.push({ name: getField('name'), due: getField('due') })
    }

    if (type === 'exams') {
      next.exams.push({ name: getField('name'), date: getField('date'), time: getField('time') })
    }
  })

  return next
}

function countItems(data) {
  return (data.classes?.length || 0) + (data.assignments?.length || 0) + (data.exams?.length || 0)
}

function setImportStatus(message, isError = false) {
  const status = document.getElementById('import-status')
  status.textContent = message
  status.classList.toggle('error', isError)
}

function setReviewStatus(message, isError = false) {
  const status = document.getElementById('review-status')
  status.textContent = message
  status.classList.toggle('error', isError)
}

async function parseSyllabus() {
  const fileInput = document.getElementById('syllabus-file')
  const selectedFile = fileInput.files[0]
  const filePath = selectedFile && webUtils?.getPathForFile ? webUtils.getPathForFile(selectedFile) : ''
  const fileBuffer = selectedFile ? await selectedFile.arrayBuffer() : null
  const fileName = selectedFile?.name || ''
  const extraText = document.getElementById('extra-text').value

  setImportStatus('Reading syllabus...')

  try {
    const result = await ipcRenderer.invoke('parse-syllabus', { filePath, fileBuffer, fileName, extraText })
    importedData = result.imported
    renderReviewList(importedData)

    const source = result.usedAi ? 'AI found' : 'Local parser found'
    const warning = result.warning ? ` ${result.warning}` : ''
    const message = `${source} ${countItems(importedData)} item(s). Review before saving.${warning}`
    setImportStatus(message)
    setReviewStatus(message, Boolean(result.warning))
    showScreen('review')
  } catch (error) {
    setImportStatus(error.message, true)
  }
}

async function saveReview() {
  const reviewed = readReviewData()
  const count = countItems(reviewed)

  if (!count) {
    setImportStatus('There is nothing to save yet.', true)
    showScreen('import')
    return
  }

  try {
    const saved = await ipcRenderer.invoke('save-imported-schedule', reviewed)
    dashboardData = saved
    render()
    setImportStatus(`Saved ${count} item(s) into your dashboard.`)
    setReviewStatus('')
    showScreen('dashboard')
  } catch (error) {
    setImportStatus(`Could not save: ${error.message}`, true)
    showScreen('import')
  }
}

function render() {
  dashboardData = loadData()
  renderClasses(dashboardData)
  renderAssignments(dashboardData)
  renderExams(dashboardData)
  renderClassList(dashboardData)
}

function attachEvents() {
  document.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', () => showScreen(button.dataset.screen))
  })

  document.getElementById('back-to-classes').addEventListener('click', () => showScreen('classes'))
  document.getElementById('delete-class').addEventListener('click', deleteSelectedClass)
  document.getElementById('back-to-import').addEventListener('click', () => showScreen('import'))
  document.getElementById('cancel-edit-item').addEventListener('click', cancelEditItem)
  document.getElementById('save-edit-item').addEventListener('click', saveEditedItem)
  document.getElementById('parse-syllabus').addEventListener('click', parseSyllabus)
  document.getElementById('save-review').addEventListener('click', saveReview)
}

// clock ticks every second
setInterval(updateClock, 1000)

// data rechecks every 5 hours
setInterval(render, 18000000)

// initial load
attachEvents()
updateClock()
render()
