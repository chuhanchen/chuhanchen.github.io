#!/bin/bash
set -euo pipefail
CJ_PROJECT="$(cd "$(dirname "$0")" && pwd)"
CJ_TOOLING="${CJ_TOOLING_DIR:-/Users/mac/Documents/Codex/2026-10-19/zh/work/tooling}"
CJ_JAVA="${CJ_JAVA_DIR:-$CJ_TOOLING/jdk-17.0.20.1+1/Contents/Home}"
CJ_BUILD_TOOLS="${CJ_BUILD_TOOLS_DIR:-$CJ_TOOLING/build-tools34/android-14}"
CJ_ANDROID_JAR="${CJ_ANDROID_JAR_PATH:-$CJ_TOOLING/platform34/android-34/android.jar}"
CJ_ASSETS="${CJ_ASSET_DIR:-$CJ_PROJECT/../../ui}"
export JAVA_HOME="$CJ_JAVA"
export PATH="$CJ_JAVA/bin:$PATH"
mkdir -p "$CJ_PROJECT/build/classes" "$CJ_PROJECT/build/dex" "$CJ_PROJECT/private"
if [[ ! -s "$CJ_ASSETS/index.html" ]]; then echo "Missing UI: $CJ_ASSETS/index.html" >&2; exit 1; fi
rm -rf "$CJ_PROJECT/build/stage-assets" "$CJ_PROJECT/build/classes" "$CJ_PROJECT/build/dex"
mkdir -p "$CJ_PROJECT/build/stage-assets" "$CJ_PROJECT/build/classes" "$CJ_PROJECT/build/dex"
cp -R "$CJ_ASSETS/." "$CJ_PROJECT/build/stage-assets/"
cp "$CJ_PROJECT/assets/content-source.json" "$CJ_PROJECT/build/stage-assets/content-source.json"
if [[ ! -f "$CJ_PROJECT/private/release.p12" ]]; then
  umask 077
  python3 -c 'import secrets,sys;open(sys.argv[1],"w").write(secrets.token_urlsafe(40))' "$CJ_PROJECT/private/password.txt"
  keytool -genkeypair -noprompt -keystore "$CJ_PROJECT/private/release.p12" -storetype PKCS12 \
    -alias chenjiang-release -keyalg RSA -keysize 3072 -validity 10000 \
    -dname 'CN=Chenjiang Magazine, OU=Personal Reading, O=Chenjiang, C=CN' \
    -storepass:file "$CJ_PROJECT/private/password.txt" -keypass:file "$CJ_PROJECT/private/password.txt" 2>"$CJ_PROJECT/build/key-generation.log"
fi
chmod 600 "$CJ_PROJECT/private/release.p12" "$CJ_PROJECT/private/password.txt"
find "$CJ_PROJECT/src" -name '*.java' -print > "$CJ_PROJECT/build/sources.list"
javac -encoding UTF-8 -source 8 -target 8 -classpath "$CJ_ANDROID_JAR" -d "$CJ_PROJECT/build/classes" @"$CJ_PROJECT/build/sources.list"
jar cf "$CJ_PROJECT/build/classes.jar" -C "$CJ_PROJECT/build/classes" .
"$CJ_BUILD_TOOLS/d8" --release --min-api 23 --lib "$CJ_ANDROID_JAR" --output "$CJ_PROJECT/build/dex" "$CJ_PROJECT/build/classes.jar"
"$CJ_BUILD_TOOLS/aapt" package -f -M "$CJ_PROJECT/AndroidManifest.xml" -I "$CJ_ANDROID_JAR" -S "$CJ_PROJECT/res" -A "$CJ_PROJECT/build/stage-assets" -F "$CJ_PROJECT/build/unsigned.apk"
(cd "$CJ_PROJECT/build/dex" && "$CJ_BUILD_TOOLS/aapt" add -f "$CJ_PROJECT/build/unsigned.apk" classes.dex >/dev/null)
"$CJ_BUILD_TOOLS/zipalign" -f -p 4 "$CJ_PROJECT/build/unsigned.apk" "$CJ_PROJECT/build/aligned.apk"
"$CJ_BUILD_TOOLS/apksigner" sign --ks "$CJ_PROJECT/private/release.p12" --ks-key-alias chenjiang-release \
  --ks-pass "file:$CJ_PROJECT/private/password.txt" \
  --v1-signing-enabled true --v2-signing-enabled true --v3-signing-enabled true \
  --out "$CJ_PROJECT/build/辰江网络杂志.apk" "$CJ_PROJECT/build/aligned.apk"
"$CJ_BUILD_TOOLS/apksigner" verify --verbose --print-certs "$CJ_PROJECT/build/辰江网络杂志.apk" > "$CJ_PROJECT/build/signature-verification.txt"
"$CJ_BUILD_TOOLS/apksigner" verify --verbose --print-certs "$CJ_PROJECT/../../../outputs/原版备份/安卓_原版.apk" > "$CJ_PROJECT/build/old-signature-verification.txt" 2>&1 || true
"$CJ_BUILD_TOOLS/aapt" dump badging "$CJ_PROJECT/build/辰江网络杂志.apk" > "$CJ_PROJECT/build/apk-badging.txt"
"$CJ_BUILD_TOOLS/zipalign" -c -p 4 "$CJ_PROJECT/build/辰江网络杂志.apk"
echo "Built: $CJ_PROJECT/build/辰江网络杂志.apk"
