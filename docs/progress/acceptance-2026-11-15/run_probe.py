import argparse
import os
from pathlib import Path
import subprocess
import tempfile
import xml.etree.ElementTree as xml


def main():
    parser = argparse.ArgumentParser(description='Run isolated acceptance checks against an already-built f14433b source snapshot.')
    parser.add_argument('snapshot', type=Path)
    parser.add_argument('--java-home', type=Path, required=True)
    parser.add_argument('--m2', type=Path, default=Path.home() / '.m2' / 'repository')
    args = parser.parse_args()

    snapshot = args.snapshot.resolve()
    reports = list(snapshot.glob('*/target/surefire-reports/TEST-*.xml'))
    if not reports:
        parser.error('Build the snapshot with Maven test before running this probe.')
    output = Path(tempfile.mkdtemp(prefix='firefly-acceptance-probe-'))
    extension = output / 'mockito-extensions'
    extension.mkdir()
    (extension / 'org.mockito.plugins.MockMaker').write_text('mock-maker-subclass', encoding='utf-8')

    classpath = [str(output)]
    classpath.extend(str(path) for path in sorted(snapshot.glob('*/target/classes')))
    for report in reports:
        for prop in xml.parse(str(report)).getroot().find('properties'):
            if prop.get('name') == 'java.class.path':
                classpath.extend(path for path in prop.get('value').split(os.pathsep) if path.endswith('.jar'))
    classpath.extend(str(args.m2 / relative) for relative in [
        'org/springframework/spring-webflux/6.1.15/spring-webflux-6.1.15.jar',
        'org/springframework/cloud/spring-cloud-gateway-server/4.1.5/spring-cloud-gateway-server-4.1.5.jar',
    ])
    classpath = os.pathsep.join(dict.fromkeys(classpath))
    source = Path(__file__).with_name('FireflyAcceptanceProbe.java')
    compiled = subprocess.run([str(args.java_home / 'bin' / 'javac'), '-proc:none', '-cp', classpath,
                               '-d', str(output), str(source)])
    if compiled.returncode:
        return compiled.returncode
    log_path = output / 'probe.log'
    with log_path.open('w', encoding='utf-8') as log:
        result = subprocess.run([str(args.java_home / 'bin' / 'java'), '-cp', classpath, 'FireflyAcceptanceProbe'],
                                stdout=log, stderr=subprocess.STDOUT)
    for line in log_path.read_text(encoding='utf-8').splitlines():
        if line.startswith(('PASS ', 'FAIL ', 'SUMMARY ', 'OBSERVATION ', 'Exception in thread')):
            print(line)
    print('Full log:', log_path)
    return result.returncode


if __name__ == '__main__':
    raise SystemExit(main())
