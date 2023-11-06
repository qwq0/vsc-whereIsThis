import * as vscode from "vscode";

/**
 * 获取缩进层级
 * @param {string} text
 * @returns {number}
 */
function getIndent(text)
{
    let ret = 0;

    let indentSpace = (
        vscode.window.activeTextEditor != undefined ?
        Number(vscode.window.activeTextEditor.options.indentSize):
        4
    );
    if(indentSpace == 0 || Number.isNaN(indentSpace))
        indentSpace = 4;

    for (let i = 0; i < text.length; i++)
    {
        if (text[i] == "\t")
            ret++;
        else if (text.slice(i, i + indentSpace) == Array(indentSpace).fill(" ").join(""))
        {
            i += indentSpace - 1;
            ret++;
        }
        else
            break;
    }
    return ret;
}


/**
 * 获取提示文本
 * @returns {string}
 */
function genPromptText()
{
    if (!vscode.window.activeTextEditor)
        return "";
    if (vscode.workspace.getConfiguration("whereisthis").get("enable") != true)
        return "";
    if (
        vscode.window.activeTextEditor.document.languageId != "javascript" &&
        vscode.window.activeTextEditor.document.languageId != "typescript"
    )
        return "";

    let path = [];
    let activeLine = vscode.window.activeTextEditor.selection.active.line;

    let indent = Infinity;
    let changeLine = -1;
    let changeLineHadComment = false;
    let changeLineOnlyBrackets = false;

    for (let i = activeLine; i >= 0; i--)
    {
        let nowText = vscode.window.activeTextEditor.document.lineAt(i).text;
        if (nowText.trim() != "") // 非空行
        {
            let nowIndent = getIndent(nowText);
            if (
                nowIndent < indent || // 当前行减小了缩进
                ( // 当前行可能附属于减小缩进的行
                    nowIndent == indent &&
                    changeLine == i + 1 &&
                    changeLineOnlyBrackets &&
                    (!changeLineHadComment)
                )
            )
            {
                if (nowIndent < indent)  // 当前行减小了缩进
                {
                    indent = nowIndent;
                    changeLine = i;
                }

                let commentStartSymbol = " // ";
                let commentIndex = nowText.lastIndexOf(commentStartSymbol);
                let commentText = (
                    commentIndex != -1 ?
                        nowText.slice(commentIndex + commentStartSymbol.length) :
                        ""
                );

                if (commentText != "")
                {
                    path.unshift(commentText);
                }

                changeLineHadComment = (commentIndex != -1);
                changeLineOnlyBrackets = nowText.trim().split("").every(c => (
                    c == "{" ||
                    c == "[" ||
                    c == "("
                ));
            }
        }

        if (indent == 0)
            break;
    }

    return path.join((
        vscode.workspace.getConfiguration("whereisthis").get("pathSeparatorSpace") ?
            (" " + vscode.workspace.getConfiguration("whereisthis").get("pathSeparator") + " ") :
            vscode.workspace.getConfiguration("whereisthis").get("pathSeparator")
    ));
}

/**
 * 获取空行缩进
 * @param {number} lineNum
 * @returns {number}
 */
function getEmptyLineIndent(lineNum)
{
    for (let i = lineNum; i >= 0; i--)
    {
        let nowText = vscode.window.activeTextEditor.document.lineAt(i).text;
        if (nowText.trim() != "") // 非空行
            return getIndent(nowText);
    }
    return 0;
}

/**
 * @type {vscode.TextEditorDecorationType}
 */
let decoration = null;
let oldPromptText = "";
let oldLine = 0;
/** @type {NodeJS.Timeout} */
let timeoutId = null;

/**
 * 更新提示文本
 */
function updatePrompt()
{
    if (vscode.window.activeTextEditor)
    {
        let promptText = genPromptText();
        let activeLine = vscode.window.activeTextEditor.selection.active.line;

        if (
            oldLine != activeLine ||
            oldPromptText != promptText
        )
        {
            oldLine = activeLine;
            oldPromptText = promptText;

            if (decoration)
            {
                decoration.dispose();
                decoration = null;
            }

            let promptDistance = vscode.workspace.getConfiguration("whereisthis").get("promptDistance");
            if (promptDistance == null)
                promptDistance = 3.5;

            if (promptText != "")
            {
                decoration = vscode.window.createTextEditorDecorationType({
                    after: {
                        contentText: promptText,
                        color: "rgb(127, 127, 127, 0.8)",
                        margin: (
                            vscode.window.activeTextEditor.document.lineAt(activeLine).text.trim() != "" ?
                                promptDistance + "ch" :
                                (getEmptyLineIndent(activeLine) * 4 + promptDistance) + "ch"
                        )
                    }
                });

                let positionOfLineEnd = new vscode.Position(vscode.window.activeTextEditor.selection.active.line, 1e100);
                vscode.window.activeTextEditor.setDecorations(decoration, [
                    new vscode.Range(
                        positionOfLineEnd,
                        positionOfLineEnd
                    )
                ]);
            }
        }
    }
}

/**
 * 激活时
 * @param {vscode.ExtensionContext} extContext
 */
export async function activate(extContext)
{
    let loop = () =>
    {
        timeoutId = null;

        try
        {
            updatePrompt();
        }
        catch (e)
        { }

        let refreshInterval = vscode.workspace.getConfiguration("whereisthis").get("refreshInterval");
        refreshInterval = Math.max(10, refreshInterval);
        refreshInterval = Math.min(10 * 1000, refreshInterval);
        timeoutId = setTimeout(loop, refreshInterval);
    };
    timeoutId = setTimeout(loop, 500);
}

/**
 * 禁用时
 */
export function deactivate()
{
    if (timeoutId)
    {
        clearInterval(timeoutId);
        timeoutId = null;
    }
    if (decoration)
    {
        decoration.dispose();
        decoration = null;
    }
}