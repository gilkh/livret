const https = require('https')
const axios = require('axios')

const agent = new https.Agent({
  rejectUnauthorized: false
})

const baseURL = 'https://localhost:4000'

const client = axios.create({
  baseURL,
  httpsAgent: agent,
  validateStatus: () => true
})

;(async () => {
  try {
    const loginRes = await client.post('/auth/login', {
      email: 'admin',
      password: 'admin'
    })
    console.log('Login status:', loginRes.status, loginRes.data)
    if (loginRes.status !== 200 || !loginRes.data?.token) {
      console.log('Login failed, aborting')
      process.exit(1)
    }
    const token = loginRes.data.token
    client.defaults.headers.common.Authorization = `Bearer ${token}`

    const tplRes = await client.get('/templates')
    console.log('Templates status:', tplRes.status, `count=${Array.isArray(tplRes.data) ? tplRes.data.length : 'n/a'}`)
    const templates = Array.isArray(tplRes.data) ? tplRes.data : []
    const tpl = templates[0]
    if (!tpl) {
      console.log('No templates found')
      process.exit(1)
    }

    const studentsRes = await client.get('/students')
    console.log('Students status:', studentsRes.status, `count=${Array.isArray(studentsRes.data) ? studentsRes.data.length : 'n/a'}`)
    const students = Array.isArray(studentsRes.data) ? studentsRes.data : []
    const stu = students[0]
    if (!stu) {
      console.log('No students found')
      process.exit(1)
    }

    console.log('Using templateId:', tpl._id, 'studentId:', stu._id)

    const previewUrl = `/pdf-v2/preview/${tpl._id}/${stu._id}`
    console.log('Calling', previewUrl)
    const previewRes = await client.get(previewUrl, { responseType: 'arraybuffer' })
    console.log('Preview status:', previewRes.status)
    const contentType = previewRes.headers['content-type']
    console.log('Content-Type:', contentType)

    if (contentType && contentType.includes('application/pdf')) {
      console.log('Received PDF, size bytes:', previewRes.data.length)
    } else {
      try {
        const text = Buffer.from(previewRes.data).toString('utf8')
        console.log('Non-PDF response body:', text)
      } catch {
        console.log('Non-PDF response, could not decode body')
      }
    }
  } catch (err) {
    console.error('Error running debug-preview:', err.message)
    console.error(err.stack)
    process.exit(1)
  }
})()

