import http from 'node:http'
import crypto from 'node:crypto'
import { once } from 'node:events'

const b64 = value => Buffer.from(value).toString('base64url')
const json = value => Buffer.from(JSON.stringify(value))

export async function startMockOIDC() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
  const jwk = publicKey.export({ format: 'jwk' })
  const codes = new Map()
  let authorizationCount = 0
  let tokenCount = 0
  let profile = { email: 'admin@yiniot.com', sub: 'admin-subject', verified: true }
  const issuer = { value: '' }
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    const send = (status, value, headers = { 'content-type': 'application/json' }) => { res.writeHead(status, headers); res.end(JSON.stringify(value)) }
    if (url.pathname === '/test/profile') { profile = { email: url.searchParams.get('email') || profile.email, sub: url.searchParams.get('sub') || profile.sub, verified: url.searchParams.get('verified') !== 'false' }; return send(200, { ok: true }) }
    if (url.pathname === '/test/stats') return send(200, { authorizationCount, tokenCount })
    if (url.pathname === '/github/authorize') {
      const code = crypto.randomBytes(16).toString('hex')
      authorizationCount += 1
      codes.set(code, Object.fromEntries(url.searchParams))
      res.writeHead(302, { location: `${url.searchParams.get('redirect_uri')}?code=${code}&state=${url.searchParams.get('state')}` }); return res.end()
    }
    if (url.pathname === '/github/token') {
      const body = new URLSearchParams(await new Promise(resolve => { let raw = ''; req.on('data', c => { raw += c }); req.on('end', () => resolve(raw)) }))
      if (!codes.has(body.get('code'))) return send(400, { error: 'invalid_grant' })
      tokenCount += 1
      return send(200, { access_token: 'github-access-token', token_type: 'bearer' })
    }
    if (url.pathname === '/github/user') return send(200, { id: 4242, login: 'e2e-github', name: 'E2E GitHub', email: null })
    if (url.pathname === '/github/emails') return send(200, [{ email: profile.email, primary: true, verified: profile.verified }])
    if (url.pathname === '/.well-known/openid-configuration') return send(200, { issuer: issuer.value, authorization_endpoint: `${issuer.value}/authorize`, token_endpoint: `${issuer.value}/token`, jwks_uri: `${issuer.value}/jwks` })
    if (url.pathname === '/jwks') return send(200, { keys: [{ ...jwk, kid: 'e2e-key', use: 'sig', alg: 'RS256' }] })
    if (url.pathname === '/authorize') {
      const code = crypto.randomBytes(16).toString('hex')
      authorizationCount += 1
      codes.set(code, Object.fromEntries(url.searchParams))
      res.writeHead(302, { location: `${url.searchParams.get('redirect_uri')}?code=${code}&state=${url.searchParams.get('state')}` }); return res.end()
    }
    if (url.pathname === '/token') {
      const body = new URLSearchParams(await new Promise(resolve => { let raw = ''; req.on('data', c => { raw += c }); req.on('end', () => resolve(raw)) }))
      const request = codes.get(body.get('code'))
      if (!request || request.code_challenge !== b64(crypto.createHash('sha256').update(body.get('code_verifier') || '').digest())) return send(400, { error: 'invalid_grant' })
      const email = profile.email
      tokenCount += 1
      const verified = profile.verified
      const now = Math.floor(Date.now() / 1000)
      const claims = { iss: issuer.value, sub: request.sub || email, aud: request.client_id, nonce: request.nonce, iat: now, exp: now + 300, email, email_verified: verified, name: email.split('@')[0], groups: request.groups ? request.groups.split(',') : [] }
      const head = b64(json({ alg: 'RS256', typ: 'JWT', kid: 'e2e-key' })); const payload = b64(json(claims)); const input = `${head}.${payload}`
      const signature = crypto.createSign('RSA-SHA256').update(input).sign(privateKey)
      return send(200, { access_token: 'e2e-access-token', token_type: 'Bearer', id_token: `${input}.${b64(signature)}` })
    }
    send(404, { error: 'not_found' })
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  issuer.value = `http://127.0.0.1:${server.address().port}`
  return { issuer: issuer.value, close: () => new Promise(resolve => server.close(resolve)) }
}
