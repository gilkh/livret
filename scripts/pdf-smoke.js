const fs = require('fs')

// Allow self-signed certs for local smoke testing
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const BASE = process.env.BASE_URL || 'https://localhost:4000'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function httpGet(path, opts = {}) {
  const headers = opts.headers || {}
  const res = await fetch(BASE + path, { method: 'GET', headers })
  const buf = await res.arrayBuffer().catch(() => null)
  const text = buf ? Buffer.from(buf).toString('utf8') : null
  return { status: res.status, headers: Object.fromEntries(res.headers.entries()), data: buf ? Buffer.from(buf) : text }
}

async function httpPost(path, body, opts = {}) {
  const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {})
  const res = await fetch(BASE + path, { method: 'POST', headers: headers, body: body ? JSON.stringify(body) : undefined })
  const buf = await res.arrayBuffer().catch(() => null)
  const headersOut = Object.fromEntries(res.headers.entries())
  let data
  const contentType = headersOut['content-type'] || ''
  if (contentType.includes('application/json')) {
    data = buf ? JSON.parse(Buffer.from(buf).toString('utf8')) : null
  } else if (buf) {
    data = Buffer.from(buf)
  } else {
    data = null
  }
  return { status: res.status, headers: headersOut, data }
}

async function waitForServer(timeoutMs = 60000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await httpGet('/')
      if (r.status === 200 || r.status === 404) return true
    } catch (e) {}
    await sleep(1000)
  }
  throw new Error('Server did not respond in time')
}

async function run() {
  console.log('Waiting for server...')
  await waitForServer(60000)

  console.log('Logging in as admin...')
  const loginRes = await httpPost('/auth/login', { email: 'admin', password: 'admin' })
  console.log('Login status:', loginRes.status)
  if (loginRes.status !== 200 || !loginRes.data?.token) {
    console.error('Login failed:', loginRes.status, loginRes.data)
    process.exit(1)
  }
  const token = loginRes.data.token
  const authHeader = { Authorization: `Bearer ${token}` }

  // Ensure we have a template
  let templatesRes = await httpGet('/templates', { headers: authHeader })
  if (templatesRes.status !== 200) {
    console.error('Failed to list templates', templatesRes.status, templatesRes.data)
    process.exit(1)
  }
  let tpl = (Array.isArray(templatesRes.data) && templatesRes.data[0]) || null
  if (!tpl) {
    console.log('No templates found, creating a minimal template')
    const newTpl = { name: 'Smoke Test Template', pages: [{ blocks: [{ type: 'text', props: { text: 'Smoke PDF Test' } }] }] }
    const createTpl = await httpPost('/templates', newTpl, { headers: authHeader })
    if (createTpl.status !== 200) { console.error('Failed to create template', createTpl.status, createTpl.data); process.exit(1) }
    tpl = createTpl.data
    console.log('Created template:', tpl._id)
  } else {
    console.log('Using existing template:', tpl._id)
  }

  // Ensure school year
  let yearsRes = await httpGet('/school-years', { headers: authHeader })
  let year = (Array.isArray(yearsRes.data) && yearsRes.data[0]) || null
  if (!year) {
    console.log('No school-years found, creating one')
    const now = new Date()
    const start = `${now.getFullYear()}-09-01`
    const end = `${now.getFullYear()+1}-06-30`
    const createYear = await httpPost('/school-years', { name: `Smoke Year ${now.getFullYear()}`, startDate: start, endDate: end, active: true }, { headers: authHeader })
    if (createYear.status !== 200) { console.error('Failed to create year', createYear.status, createYear.data); process.exit(1) }
    year = createYear.data
    console.log('Created school year:', year._id)
  } else {
    console.log('Using existing school year:', year._id)
  }

  // Create class
  console.log('Creating class...')
  const classRes = await httpPost('/classes', { name: 'Smoke Class', level: 'PS', schoolYearId: year._id }, { headers: authHeader })
  if (classRes.status !== 200) { console.error('Failed to create class', classRes.status, classRes.data); process.exit(1) }
  const cls = classRes.data
  console.log('Created class:', cls._id)

  // Create first student
  console.log('Creating student A...')
  const s1 = await httpPost('/students', { firstName: 'Smoke', lastName: 'One', classId: cls._id }, { headers: authHeader })
  if (s1.status !== 200) { console.error('Failed to create student', s1.status, s1.data); process.exit(1) }
  const stu1 = s1.data
  console.log('Created student A:', stu1._id)

  // Create second student
  console.log('Creating student B...')
  const s2 = await httpPost('/students', { firstName: 'Smoke', lastName: 'Two', classId: cls._id }, { headers: authHeader })
  if (s2.status !== 200) { console.error('Failed to create student B', s2.status, s2.data); process.exit(1) }
  const stu2 = s2.data
  console.log('Created student B:', stu2._id)

  // Assign template to student A and B
  console.log('Assigning template to student A...')
  const assignA = await httpPost('/template-assignments', { templateId: tpl._id, studentId: stu1._id }, { headers: authHeader })
  if (assignA.status !== 200) { console.error('Failed to assign template A', assignA.status, assignA.data); process.exit(1) }
  const assignmentA = assignA.data
  console.log('Assignment A:', assignmentA._id)

  console.log('Assigning template to student B...')
  const assignB = await httpPost('/template-assignments', { templateId: tpl._id, studentId: stu2._id }, { headers: authHeader })
  if (assignB.status !== 200) { console.error('Failed to assign template B', assignB.status, assignB.data); process.exit(1) }
  const assignmentB = assignB.data
  console.log('Assignment B:', assignmentB._id)

  // Wait a bit for frontend caches to warm if needed
  await sleep(1000)

  // Call preview PDF (single)
  console.log('Requesting preview PDF...')
  const previewUrl = `/pdf-v2/preview/${tpl._id}/${stu1._id}`
  const previewRes = await httpGet(previewUrl, { headers: authHeader })
  console.log('Preview status:', previewRes.status, 'content-type:', previewRes.headers['content-type'])
  if (previewRes.headers['content-type'] && previewRes.headers['content-type'].includes('application/pdf')) {
    fs.writeFileSync('smoke-preview.pdf', Buffer.from(previewRes.data))
    console.log('Saved smoke-preview.pdf, bytes:', previewRes.data.length)
  } else {
    const txt = (typeof previewRes.data === 'string') ? previewRes.data : (previewRes.data ? previewRes.data.toString('utf8') : '')
    console.log('Preview response body:', txt.substring(0, 500))
  }

  // Call ZIP for both assignments
  console.log('Requesting ZIP for two assignments...')
  const zipRes = await httpPost('/pdf-v2/assignments/zip', { assignmentIds: [assignmentA._id, assignmentB._id], groupLabel: 'smoke-batch', token: token }, { headers: authHeader })
  console.log('ZIP status:', zipRes.status, 'content-type:', zipRes.headers['content-type'])
  if (zipRes.headers['content-type'] && zipRes.headers['content-type'].includes('application/zip')) {
    fs.writeFileSync('smoke-batch.zip', Buffer.from(zipRes.data))
    console.log('Saved smoke-batch.zip, bytes:', zipRes.data.length)
  } else {
    try {
      const txt = (typeof zipRes.data === 'string') ? zipRes.data : (zipRes.data ? zipRes.data.toString('utf8') : '')
      console.log('ZIP response body:', txt.substring(0, 500))
    } catch (e) {
      console.log('ZIP response not readable')
    }
  }

  console.log('Smoke test completed')
}

run().catch(err => { console.error('Smoke test failed:', err.message); console.error(err.stack); process.exit(1) })
