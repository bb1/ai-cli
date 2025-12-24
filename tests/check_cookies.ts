
const psid = process.env.TEST_GEMINI_COOKIE_PSID;
const psidts = process.env.TEST_GEMINI_COOKIE_PSIDTS;

if (!psid || !psidts) {
    console.error("Missing cookies in env");
    process.exit(1);
}

const cookieHeader = `__Secure-1PSID=${psid}; __Secure-1PSIDTS=${psidts}`;

console.log("Making request...");
const response = await fetch("https://gemini.google.com/app", {
    headers: {
        "Cookie": cookieHeader,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
});

console.log("Status:", response.status);
const setCookie = response.headers.get("set-cookie");
if (setCookie) {
    console.log("Set-Cookie headers found:");
    console.log(setCookie);
} else {
    console.log("No Set-Cookie header found.");
}
