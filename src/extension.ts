import * as vscode from 'vscode';

interface Parameter {
	name: string;
	default?: string;
	placeHolder?: string;
	chosen?: vscode.QuickPickItem[];
}

class Command {
	terminalName?: string;
	command: string = '';
	name: string = '';
	parameter?: { defalut?: string; placeHolder?: string; } | Parameter[];

	constructor(name: string, command: string, terminalName?: string, parameter?: { defalut?: string; placeHolder?: string; } | Parameter[]) {
		this.name = name;
		this.command = command;
		this.terminalName = terminalName;
		this.parameter = parameter;
	}

	async execute() {
		let terminal = vscode.window.createTerminal(this.terminalName ?? this.name);
		const parameters: string[] = await this.getParameter(this);
		terminal.sendText(`${this.command} ${parameters.join(' ')}`);
		terminal.show();
	}

	async getParameter(command: Command): Promise<string[]> {
		if (command.parameter === undefined) return [];
		let parameters: string[] = [];
		if (this.parameter instanceof Array) {
			for (let parameter of this.parameter) {
				let value = undefined;
				if (parameter.chosen?.length) {
					value = (await vscode.window.showQuickPick(parameter.chosen, {
						placeHolder: parameter.placeHolder,
						matchOnDescription: true,
						ignoreFocusOut: true,
					}))?.label;
				} else {
					value = await vscode.window.showInputBox({
						prompt: `为命令 ${command.command} ${parameters.join(' ')} ${parameters.length > 0 ? '继续' : ''}输入参数 ${parameter.name ?? ''} `,
						placeHolder: parameter.placeHolder,
						value: parameter.default,
						ignoreFocusOut: true,
					});
				}
				if (value === undefined) throw new Error('用户取消输入');
				parameters.push(value.trim());
			}
		} else {
			const value = await vscode.window.showInputBox({
				prompt: `为命令 ${command.command} 一次性输入所有参数 用' '分割`,
				placeHolder: this.parameter?.placeHolder,
				value: this.parameter?.defalut,
				ignoreFocusOut: true,
			});
			if (value === undefined) throw new Error('用户取消输入');
			return value.trim().split(' ');
		}
		return parameters;
	}

}

async function executeCommands(commands: Command[]) {
	if (commands.length === 0) return;
	let progressOptions = {
		location: vscode.ProgressLocation.Notification,
		cancellable: true
	};

	vscode.window.withProgress(progressOptions, async (progress, token) => {
		return new Promise<void>(async (resolve, reject) => {
			for (let i = 0; i < commands.length; i++) {
				if (token.isCancellationRequested) {
					if (i > 0) vscode.window.showInformationMessage(`已经执行了以下命令：${commands.slice(0, i).map(cmd => cmd.name).join(', ')}`);
					vscode.window.showWarningMessage(`以下命令没有执行：${commands.slice(i).map(cmd => cmd.name).join(', ')}`);
					reject();
					return;
				}
				try {
					progress.report({ increment: 100 / commands.length, message: `当前命令${commands[i].name}, 进度(${i + 1}/${commands.length})` });
					await commands[i].execute();
				} catch (error) {
					vscode.window.showErrorMessage(`执行命令${commands[i].name}时出错：${error}`);
					if (i > 0) vscode.window.showInformationMessage(`已经执行了以下命令：${commands.slice(0, i).map(cmd => cmd.name).join(', ')}`);
					vscode.window.showWarningMessage(`以下命令没有执行：${commands.slice(i).map(cmd => cmd.name).join(', ')}`);
					reject(error);
					return;
				}
			}
			resolve();
		});

	});
}

export function activate(context: vscode.ExtensionContext) {
	let create_cmd = vscode.commands.registerCommand('cmdterminalmaker.createTerminal', async () => {
		const commandConfigs: (Command | undefined)[] = vscode.workspace.getConfiguration('cmdterminalmaker').get<Command[]>('commands') ?? [];
		const commands = commandConfigs
			.map((config) => {
				const { name, command, terminalName, parameter } = config as Command;
				return new Command(name, command, terminalName, parameter);
			});
		const name2commands: Map<string, Command> = new Map(commands.map(command => [command.name, command]));
		const chosenCmmandNames = await vscode.window.showQuickPick(commands.map(command => command.name), {
			placeHolder: '请选择命令进行执行',
			canPickMany: true,
			matchOnDescription: true
		});
		await executeCommands(chosenCmmandNames?.map(name => name2commands.get(name) as Command) ?? []);
	});
	context.subscriptions.push(create_cmd);
}

export function deactivate() { }