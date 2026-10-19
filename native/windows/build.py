#!/usr/bin/env python3
"""Build self-contained Windows installers from checksum-verified Electron runtimes."""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import struct
import subprocess
import zipfile

BASE = Path(__file__).resolve().parent
SRC = BASE / 'src'
CACHE = BASE / 'cache'
DIST = BASE / 'dist'

def digest(p):
    with open(p, 'rb') as f:
        h = hashlib.sha256()
        while b := f.read(1024 * 1024): h.update(b)
    return h.hexdigest()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--ui', type=Path, default=BASE.parent.parent / 'ui')
    parser.add_argument('--target', choices=['all', 'win7', 'win10', 'win10-32'], default='all')
    args = parser.parse_args()
    ui = args.ui.resolve()
    assert (ui / 'index.html').is_file(), 'Missing shared UI'
    selection = json.loads((CACHE / 'releases-selection.json').read_text())
    targets = [
        ('win7', selection['electron22'], 'ia32', '辰江网络杂志安装包.exe'),
        ('win10', selection['latest'], 'x64', '辰江网络杂志Win10安装包.exe'),
        ('win10-32', selection['electron43'], 'ia32', '辰江网络杂志Win10_32位兼容安装包.exe')
    ]
    reports = []
    for target, release, arch, filename in targets:
        if args.target not in ['all', target] or (args.target == 'all' and target == 'win10-32'): continue
        version = release['version']
        runtime_name = f'electron-v{version}-win32-{arch}.zip'
        runtime = CACHE / runtime_name
        sums = (CACHE / f'SHASUMS256-{version}.txt').read_text()
        expected = next(s.split()[0] for s in sums.splitlines() if s.split()[-1].lstrip('*') == runtime_name)
        assert digest(runtime) == expected, f'Electron checksum mismatch: {runtime_name}'
        package = DIST / target
        if package.exists(): shutil.rmtree(package)
        package.mkdir(parents=True)
        appdir = package / 'app'
        with zipfile.ZipFile(runtime) as z: z.extractall(appdir)
        (appdir / 'electron.exe').rename(appdir / 'ChenJiangMagazine.exe')
        for unused in ['default_app.asar']:
            (appdir / 'resources' / unused).unlink(missing_ok=True)
        app = appdir / 'resources' / 'app'
        app.mkdir()
        for f in ['package.json', 'main.js', 'content.js', 'content-source.json', 'preload.js']:
            shutil.copy2(SRC / f, app / f)
        shutil.copytree(ui, app / 'ui')
        icon = SRC / 'magazine.ico'
        shutil.copy2(icon, app / 'magazine.ico')
        shutil.copy2(icon, package / 'magazine.ico')
        for name in ['setup', 'uninstall']:
            text = (SRC / (name + '.vbs.txt')).read_text(encoding='utf-8').replace('\r\n', '\n')
            (package / (name + '.vbs')).write_bytes(text.replace('\n', '\r\n').encode('utf-16'))
        files = {str(f.relative_to(app / 'ui')): digest(f) for f in sorted((app / 'ui').rglob('*')) if f.is_file()}
        build_info = {'applicationVersion': '4.0.1', 'target': target, 'arch': arch,
            'electron': version, 'chromium': release['chrome'], 'runtimeSha256': expected,
            'runtimeSource': f'https://github.com/electron/electron/releases/download/v{version}/{runtime_name}',
            'uiFiles': files, 'testedOnActualWindows': False}
        (app / 'build-info.json').write_text(json.dumps(build_info, ensure_ascii=False, indent=2), encoding='utf-8')
        archive = DIST / (target + '-payload.7z')
        archive.unlink(missing_ok=True)
        subprocess.run(['7zz', 'a', '-t7z', '-m0=lzma', '-mx=5', '-md=16m', '-ms=on',
            str(archive), 'app', 'setup.vbs', 'uninstall.vbs', 'magazine.ico'], cwd=package, check=True,
            stdout=subprocess.DEVNULL)
        config = (';!@Install@!UTF-8!\n'
            'Title="辰江网络杂志 4.0 体验版 安装程序"\n'
            'RunProgram="wscript.exe //Nologo setup.vbs"\n'
            'ExtractTitle="正在准备辰江网络杂志"\n'
            'ExtractDialogText="正在解压完整阅读引擎，请稍候…"\n'
            ';!@InstallEnd@!\n').encode('utf-8')
        installer = DIST / filename
        with installer.open('wb') as f:
            f.write((CACHE / '7zS.sfx').read_bytes())
            f.write(config)
            with archive.open('rb') as a: shutil.copyfileobj(a, f)
        subprocess.run(['7zz', 't', str(installer)], check=True, stdout=subprocess.DEVNULL)
        exe = (appdir / 'ChenJiangMagazine.exe').read_bytes()
        pe_offset = struct.unpack_from('<I', exe, 0x3c)[0]
        machine = struct.unpack_from('<H', exe, pe_offset + 4)[0]
        assert machine == (0x14c if arch == 'ia32' else 0x8664)
        report = {**build_info, 'installer': str(installer), 'installerBytes': installer.stat().st_size,
            'installerSha256': digest(installer), 'archiveIntegrityVerified': True,
            'runtimePeArchitectureVerified': True, 'payloadFileCount': sum(1 for x in package.rglob('*') if x.is_file())}
        reports.append(report)
        print(json.dumps({k: report[k] for k in ['target', 'electron', 'arch', 'installer', 'installerBytes', 'installerSha256']}, ensure_ascii=False), flush=True)
    (DIST / 'build-report.json').write_text(json.dumps(reports, ensure_ascii=False, indent=2), encoding='utf-8')

if __name__ == '__main__': main()
