import * as vscode from "vscode";

/**
 * 获取缩进层级
 * @param {string} text
 * @returns {number}
 */
function getIndent(text)
{
    let ret = 0;
    let indentSpace = 4;
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

    return path.join(" > ");
}

/**
 * @type {vscode.TextEditorDecorationType}
 */
let decoration = null;
let oldPromptText = "";
let oldLine = 0;
/** @type {NodeJS.Timeout} */
let intervalId = null;

/**
 * 激活时
 * @param {vscode.ExtensionContext} extContext
 */
export async function activate(extContext)
{
    intervalId = setInterval(() =>
    {
        if (vscode.window.activeTextEditor)
        {
            let promptText = genPromptText();

            if (
                oldLine != vscode.window.activeTextEditor.selection.active.line ||
                oldPromptText != promptText
            )
            {
                oldLine = vscode.window.activeTextEditor.selection.active.line;
                oldPromptText = promptText;

                if (decoration)
                    decoration.dispose();

                decoration = vscode.window.createTextEditorDecorationType({
                    after: {
                        contentText: promptText,
                        color: "rgb(127, 127, 127, 0.8)",
                        margin: "50px"
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
    }, 150);
}

/**
 * 禁用时
 */
export function deactivate()
{
    if (intervalId)
    {
        clearInterval(intervalId);
        intervalId = null;
    }
    if (decoration)
    {
        decoration.dispose();
        decoration = null;
    }
}