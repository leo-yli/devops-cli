import axios from 'axios';
import { publicEncrypt, constants } from 'node:crypto';
import { saveCredentials, deleteCredentials } from '../../auth/store.js';
import { saveConfig } from '../../config.js';
import { ApiError } from '../../core/exceptions.js';
import { apiClient } from './client.js';

function encryptPassword(password: string, publicKeyPem: string): string {
  let pem = publicKeyPem
    .replace(/-----END RSA PUBLIC\s+KEY-----/, '-----END RSA PUBLIC KEY-----')
    .replace(/\r\n/g, '\n')
    .trim();

  // The platform sends 'BEGIN RSA PUBLIC KEY' headers but the DER payload is
  // actually PKCS#8 SubjectPublicKeyInfo (not PKCS#1 RSAPublicKey).
  // Detect by inspecting the byte after the outer SEQUENCE length:
  //   PKCS#8: next tag is 0x30 (inner SEQUENCE = AlgorithmIdentifier)
  //   PKCS#1: next tag is 0x02 (INTEGER = modulus)
  if (pem.includes('BEGIN RSA PUBLIC KEY')) {
    const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
    const der = Buffer.from(b64, 'base64');
    let pos = 1;
    if (der[1] & 0x80) pos += (der[1] & 0x7f) + 1;
    else pos += 1;
    if (der[pos] === 0x30) {
      // Content is PKCS#8 — swap to the correct PEM header
      pem = pem
        .replace('-----BEGIN RSA PUBLIC KEY-----', '-----BEGIN PUBLIC KEY-----')
        .replace('-----END RSA PUBLIC KEY-----', '-----END PUBLIC KEY-----');
    }
  }

  return publicEncrypt(
    { key: pem, padding: constants.RSA_PKCS1_PADDING },
    Buffer.from(password, 'utf8'),
  ).toString('base64');
}

function extractCookieValue(setCookieHeaders: string[], name: string): string {
  for (const header of setCookieHeaders) {
    const m = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
    if (m) return m[1];
  }
  return '';
}

function extractPublicKeyFromHtml(html: string): string {
  // Hidden input: <input ... name="public_key" ... value="...">
  const patterns = [
    /name=["']public_key["'][^>]*value=["']([\s\S]*?)["']\s*\/?>/i,
    /value=["']([\s\S]*?)["'][^>]*name=["']public_key["']\s*\/?>/i,
    /id=["']public_key["'][^>]*value=["']([\s\S]*?)["']\s*\/?>/i,
  ];
  for (const re of patterns) {
    const m = re.exec(html);
    if (m) {
      return m[1]
        .replace(/&#13;&#10;|&#xD;&#xA;/g, '\n')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .trim();
    }
  }
  return '';
}

export class AuthService {
  async login(host: string, username: string, password: string): Promise<void> {
    const baseUrl = host.replace(/\/$/, '');
    const loginUrl = `${baseUrl}/auth/login`;

    // Step 1: GET login page — obtain CSRF token cookie and RSA public key
    const getRes = await axios.get<string>(loginUrl, {
      headers: { Accept: 'text/html,application/xhtml+xml' },
      validateStatus: s => s < 500,
    });

    const getCookies = ((getRes.headers['set-cookie'] ?? []) as string[]);
    const csrfToken = extractCookieValue(getCookies, 'csrftoken');
    const publicKey = extractPublicKeyFromHtml(getRes.data);

    if (!publicKey) {
      throw new ApiError('无法从登录页面获取 RSA 公钥，请确认平台地址是否正确');
    }

    // Step 2: RSA-encrypt the password
    let encryptedPassword: string;
    try {
      encryptedPassword = encryptPassword(password, publicKey);
    } catch (e: any) {
      throw new ApiError(`密码加密失败: ${e.message}`);
    }

    // Step 3: POST form — do NOT follow redirect so we can capture Set-Cookie
    const formData = new URLSearchParams({
      csrfmiddlewaretoken: csrfToken,
      username,
      password: encryptedPassword,
      next: '/',
      public_key: publicKey,
    });

    const postRes = await axios.post(loginUrl, formData.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': csrfToken ? `csrftoken=${csrfToken}` : '',
        'Referer': loginUrl,
      },
      maxRedirects: 0,
      validateStatus: s => s < 500,
    });

    // Step 4: Extract session cookie from redirect response
    const postCookies = ((postRes.headers['set-cookie'] ?? []) as string[]);
    const sessionid = extractCookieValue(postCookies, 'sessionid');
    const newCsrf = extractCookieValue(postCookies, 'csrftoken') || csrfToken;

    if (!sessionid) {
      // 200 means form re-rendered (wrong credentials); 302 means success
      if (postRes.status === 200) {
        throw new ApiError('用户名或密码错误');
      }
      throw new ApiError(`登录失败 (HTTP ${postRes.status})，未获取到会话信息`);
    }

    await saveCredentials({ sessionid, csrftoken: newCsrf });
    await saveConfig({ defaultHost: host });

    // Reset the API client so next request picks up fresh credentials
    apiClient.reset();
  }

  async logout(): Promise<void> {
    await deleteCredentials();
    apiClient.reset();
  }
}

export const authService = new AuthService();
