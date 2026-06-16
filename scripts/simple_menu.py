#!/usr/bin/env python3
import json
import os
import shutil
import subprocess
import sys
import tempfile

REPO_URL = 'https://github.com/jackkay-encrypt/simplemoitor.git'
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
CONFIG_PATH = os.path.join(BASE_DIR, 'agent', 'config.json')
AGENT_PATH = os.path.join(BASE_DIR, 'agent', 'server_agent.py')
INSTALL_PATH = os.path.join(BASE_DIR, 'agent', 'install.sh')


def find_python():
    preferred = '/www/server/panel/pyenv/bin/python3'
    if os.path.exists(preferred) and os.access(preferred, os.X_OK):
        return preferred
    found = shutil.which('python3')
    if found:
        return found
    return sys.executable


def load_config():
    if not os.path.exists(CONFIG_PATH):
        print('未找到配置文件：{}'.format(CONFIG_PATH))
        print('请先执行安装脚本初始化程序。')
        return None
    with open(CONFIG_PATH, 'r', encoding='utf-8') as file:
        return json.load(file)


def save_config(config):
    with open(CONFIG_PATH, 'w', encoding='utf-8') as file:
        json.dump(config, file, ensure_ascii=False, indent=2)
        file.write('\n')
    try:
        os.chmod(CONFIG_PATH, 0o600)
    except Exception:
        pass


def run_agent(*args):
    python_bin = find_python()
    return subprocess.call([python_bin, AGENT_PATH] + list(args))


def show_bind_command():
    config = load_config()
    if not config:
        return
    bind_input = "{} {}".format(
        config.get("server_id", ""),
        config.get("bind_code", "")
    )
    print('\nTelegram 绑定指令：')
    print('/bind {}'.format(bind_input))
    print('\n绑定服务器时也可以只粘贴：')
    print(bind_input)


def show_server_id():
    config = load_config()
    if config:
        print('\nsrv_id: {}'.format(config.get('server_id', '')))


def show_bind_code():
    config = load_config()
    if config:
        print('\nbind_code: {}'.format(config.get('bind_code', '')))


def show_bind_port():
    config = load_config()
    if config:
        print('\n当前绑定端口: {}'.format(config.get('bind_port', '')))


def validate_port(port):
    port = str(port or '').strip()
    if not port.isdigit():
        return False
    number = int(port)
    return 1 <= number <= 65535


def edit_bind_port():
    config = load_config()
    if not config:
        return
    current_port = str(config.get('bind_port', '')).strip()
    print('\n当前绑定端口: {}'.format(current_port or '未设置'))
    new_port = input('请输入新的绑定端口(1-65535): ').strip()
    if not validate_port(new_port):
        print('端口无效，请输入 1-65535 的数字。')
        return
    config['bind_port'] = new_port
    save_config(config)
    print('绑定端口已修改为: {}'.format(new_port))
    print('正在同步到 Controller...')
    code = run_agent('--once')
    if code == 0:
        print('同步完成。新的 Telegram 绑定输入如下：')
        run_agent('id')
    else:
        print('同步失败，请稍后手动执行 Agent 或等待 crontab 自动同步。')


def copy_project(src_dir, target_dir):
    skip_paths = {
        os.path.join('agent', 'config.json'),
        os.path.join('controller', 'config.json'),
    }
    skip_dirs = {'.git', '__pycache__', 'runtime'}
    for root, dirs, files in os.walk(src_dir):
        rel_root = os.path.relpath(root, src_dir)
        if rel_root == '.':
            rel_root = ''
        dirs[:] = [name for name in dirs if name not in skip_dirs]
        for filename in files:
            rel_path = os.path.join(rel_root, filename) if rel_root else filename
            if rel_path in skip_paths:
                continue
            src_path = os.path.join(root, filename)
            dst_path = os.path.join(target_dir, rel_path)
            os.makedirs(os.path.dirname(dst_path), exist_ok=True)
            shutil.copy2(src_path, dst_path)


def update_program():
    config = load_config()
    if not config:
        return
    controller_url = config.get('controller_url') or 'http://127.0.0.1:8765'
    bind_port = str(config.get('bind_port') or '').strip()
    bind_ip = str(config.get('bind_ip') or '').strip()
    temp_dir = tempfile.mkdtemp(prefix='simplemoitor_update_')
    clone_dir = os.path.join(temp_dir, 'simplemoitor')
    print('\n正在下载最新版程序...')
    try:
        subprocess.check_call(['git', 'clone', '--depth', '1', REPO_URL, clone_dir])
        print('下载完成，正在安装更新...')
        copy_project(clone_dir, BASE_DIR)
        install_cmd = ['bash', INSTALL_PATH, controller_url]
        if bind_port:
            install_cmd.append(bind_port)
        if bind_ip:
            install_cmd.append(bind_ip)
        subprocess.check_call(install_cmd)
        print('更新完成。')
    except subprocess.CalledProcessError as error:
        print('更新失败，命令退出码：{}'.format(error.returncode))
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)
        print('已删除临时安装文件：{}'.format(temp_dir))


def uninstall_program():
    print()
    print('警告：此操作将完全删除 simplemoitor 管理程序！')
    print('包括：程序文件、配置文件、定时任务、快捷命令。')
    print('此操作不可恢复。')
    print()
    confirm = input('确认删除请输入 YES: ').strip()
    if confirm != 'YES':
        print('已取消删除。')
        return
    print()
    # Remove crontab entries
    try:
        result = subprocess.run(['crontab', '-l'], capture_output=True, text=True)
        if result.returncode == 0:
            lines = [l for l in result.stdout.splitlines() if 'simplemoitor' not in l]
            new_cron = chr(10).join(lines) + chr(10) if lines else ''
            subprocess.run(['crontab', '-'], input=new_cron, text=True, capture_output=True)
            print('✓ 已清除定时任务')
    except Exception as e:
        print('清除定时任务失败: {}'.format(e))
    # Remove shortcut commands
    for path in ['/www/srvid', '/www/simple', '/usr/local/bin/simple']:
        if os.path.exists(path):
            try:
                os.remove(path)
                print('✓ 已删除 {}'.format(path))
            except Exception as e:
                print('删除 {} 失败: {}'.format(path, e))
    # Remove program directory
    if os.path.exists(BASE_DIR):
        try:
            shutil.rmtree(BASE_DIR)
            print('✓ 已删除程序目录 {}'.format(BASE_DIR))
        except Exception as e:
            print('删除程序目录失败: {}'.format(e))
            print('请手动执行: rm -rf {}'.format(BASE_DIR))
    print()
    print('simplemoitor 已完全卸载。')
    sys.exit(0)


def print_menu():
    print('\n=== simplemoitor 管理菜单 ===')
    print('1. 查看 Telegram 的绑定指令')
    print('2. 查看 srv_id')
    print('3. 查看 bind_code')
    print('4. 自动更新程序')
    print('5. 修改通信端口')
    print('6. 删除插件')
    print('0. 退出')


def handle_choice(choice):
    if choice == '1':
        show_bind_command()
    elif choice == '2':
        show_server_id()
    elif choice == '3':
        show_bind_code()
    elif choice == '4':
        update_program()
    elif choice == '5':
        edit_bind_port()
    elif choice == '6':
        uninstall_program()
    elif choice == '0':
        return False
    else:
        print('无效选择，请输入 0-6。')
    return True


def main():
    if len(sys.argv) > 1:
        handle_choice(sys.argv[1].strip())
        return 0
    print_menu()
    choice = input('请输入编号: ').strip()
    if choice == '0':
        print('已退出。')
        return 0
    handle_choice(choice)
    return 0


if __name__ == '__main__':
    sys.exit(main())
