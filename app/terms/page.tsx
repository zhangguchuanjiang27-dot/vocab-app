
import Link from "next/link";

export default function TermsPage() {
    return (
        <div className="max-w-3xl mx-auto px-6 py-24 text-neutral-900 dark:text-neutral-100">
            <h1 className="text-3xl font-black mb-8 dark:text-white">利用規約</h1>
            <div className="space-y-6 text-sm sm:text-base leading-relaxed text-neutral-800 dark:text-neutral-200">
                <p className="font-bold mb-8">この利用規約（以下，「本規約」といいます。）は，「Voca」（以下，「本サービス」といいます。）の利用条件を定めるものです。本サービスを利用する皆さま（以下，「ユーザー」といいます。）には，本規約に従って，本サービスをご利用いただきます。</p>

                <section>
                    <h3 className="text-xl font-bold mt-8 mb-4 text-neutral-900 dark:text-white">第1条（適用）</h3>
                    <ol className="list-decimal pl-5 space-y-2">
                        <li>本規約は，ユーザーと本サービス運営者（以下，「運営者」といいます。）との間の本サービスの利用に関わる一切の関係に適用されるものとします。</li>
                        <li>運営者は本サービスに関し，本規約のほか，ご利用にあたってのルール等，各種の定め（以下，「個別規定」といいます。）をすることがあります。これら個別規定はその名称のいかんに関わらず，本規約の一部を構成するものとします。</li>
                        <li>本規約の規定が前項の個別規定の規定と矛盾する場合には，個別規定において特段の定めなき限り，個別規定の規定が優先されるものとします。</li>
                    </ol>
                </section>

                <section>
                    <h3 className="text-xl font-bold mt-8 mb-4 text-neutral-900 dark:text-white">第2条（利用登録）</h3>
                    <ol className="list-decimal pl-5 space-y-2">
                        <li>本サービスにおいては，登録希望者が本規約に同意の上，当社の定める方法によって利用登録を申請し，運営者がこれを承認することによって，利用登録が完了するものとします。</li>
                        <li>運営者は，利用登録の申請者に以下の事由があると判断した場合，利用登録の申請を承認しないことがあり，その理由については一切の開示義務を負わないものとします。
                            <ul className="list-disc pl-5 mt-2 space-y-1">
                                <li>利用登録の申請に際して虚偽の事項を届け出た場合</li>
                                <li>本規約に違反したことがある者からの申請である場合</li>
                                <li>その他，運営者が利用登録を相当でないと判断した場合</li>
                            </ul>
                        </li>
                    </ol>
                </section>

                <section>
                    <h3 className="text-xl font-bold mt-8 mb-4 text-neutral-900 dark:text-white">第3条（ユーザーIDおよびパスワードの管理）</h3>
                    <ol className="list-decimal pl-5 space-y-2">
                        <li>ユーザーは，自己の責任において，本サービスのユーザーID（Googleアカウント等）およびパスワードを適切に管理するものとします。</li>
                        <li>ユーザーは，いかなる場合にも，ユーザーIDおよびパスワードを第三者に譲渡または貸与し，もしくは第三者と共用することはできません。</li>
                        <li>運営者は，登録されたIDによって本サービスの利用があった場合，利用登録を行っている本人が利用したものとみなすことができます。</li>
                    </ol>
                </section>

                <section>
                    <h3 className="text-xl font-bold mt-8 mb-4 text-neutral-900 dark:text-white">第4条（利用料金および支払方法）</h3>
                    <ol className="list-decimal pl-5 space-y-2">
                        <li>ユーザーは，本サービスの有料部分の対価として，運営者が別途定め，本ウェブサイトに表示する利用料金を，運営者が指定する方法（Stripe決済等）により支払うものとします。</li>
                        <li>有料プランは自動更新されます。ユーザーが期間満了前に解約手続きを行わない限り，契約は自動的に更新され，利用料金が請求されます。</li>
                        <li>決済済みの利用料金については，理由のいかんを問わず返金を行わないものとします。</li>
                    </ol>
                </section>

                <section>
                    <h3 className="text-xl font-bold mt-8 mb-4 text-neutral-900 dark:text-white">第5条（AI生成機能に関する特記事項）</h3>
                    <ol className="list-decimal pl-5 space-y-2">
                        <li>本サービスは，人工知能（以下「AI」といいます）技術を利用してコンテンツを生成します。</li>
                        <li>ユーザーは，AIの特性上，生成される情報が必ずしも正確性，完全性，最新性，適法性を欠いていないことを保証するものではないことを理解し，同意するものとします。</li>
                        <li>AIによって生成されたコンテンツ等の利用によってユーザーに生じた損害について，運営者は一切の責任を負わないものとします。ユーザーは自己の責任において生成された内容を確認し，利用するものとします。</li>
                        <li>ユーザーは，AIに対して，違法，暴力的，差別的，その他公序良俗に反する内容の入力を意図的に行ってはなりません。</li>
                    </ol>
                </section>

                <section>
                    <h3 className="text-xl font-bold mt-8 mb-4 text-neutral-900 dark:text-white">第6条（禁止事項）</h3>
                    <p>ユーザーは，本サービスの利用にあたり，以下の行為をしてはなりません。</p>
                    <ul className="list-disc pl-5 mt-2 space-y-1">
                        <li>法令または公序良俗に違反する行為</li>
                        <li>犯罪行為に関連する行為</li>
                        <li>本サービスの内容等，本サービスに含まれる著作権，商標権ほか知的財産権を侵害する行為</li>
                        <li>運営者，ほかのユーザー，またはその他第三者のサーバーまたはネットワークの機能を破壊したり，妨害したりする行為</li>
                        <li>本サービスによって得られた情報を商業的に利用する行為（ただし，運営者が個別に許諾したものを除く）</li>
                        <li>運営者のサービスの運営を妨害するおそれのある行為</li>
                        <li>不正アクセスをし，またはこれを試みる行為</li>
                        <li>他のユーザーまたはその他の第三者に成りすます行為</li>
                        <li>他のユーザーに関する個人情報等を収集または蓄積する行為</li>
                        <li>不正な目的を持って本サービスを利用する行為</li>
                        <li>本サービスの他のユーザーまたはその他の第三者に不利益，損害，不快感を与える行為</li>
                        <li>その他，運営者が不適切と判断する行為</li>
                    </ul>
                </section>

                <section>
                    <h3 className="text-xl font-bold mt-8 mb-4 text-neutral-900 dark:text-white">第7条（本サービスの提供の停止等）</h3>
                    <p>運営者は，以下のいずれかの事由があると判断した場合，ユーザーに事前に通知することなく本サービスの全部または一部の提供を停止または中断することができるものとします。</p>
                    <ul className="list-disc pl-5 mt-2 space-y-1">
                        <li>本サービスにかかるコンピュータシステムの保守点検または更新を行う場合</li>
                        <li>地震，落雷，火災，停電または天災などの不可抗力により，本サービスの提供が困難となった場合</li>
                        <li>コンピュータまたは通信回線等が事故により停止した場合</li>
                        <li>その他，運営者が本サービスの提供が困難と判断した場合</li>
                    </ul>
                </section>

                <section>
                    <h3 className="text-xl font-bold mt-8 mb-4 text-neutral-900 dark:text-white">第8条（利用制限および登録抹消）</h3>
                    <ol className="list-decimal pl-5 space-y-2">
                        <li>運営者は，ユーザーが以下のいずれかに該当する場合には，事前の通知なく，ユーザーに対して，本サービスの全部もしくは一部の利用を制限し，またはユーザーとしての登録を抹消することができるものとします。
                            <ul className="list-disc pl-5 mt-1 space-y-1">
                                <li>本規約のいずれかの条項に違反した場合</li>
                                <li>登録事項に虚偽の事実があることが判明した場合</li>
                                <li>料金等の支払債務の不履行があった場合</li>
                                <li>その他，運営者が本サービスの利用を適当でないと判断した場合</li>
                            </ul>
                        </li>
                        <li>運営者は，本条に基づき運営者が行った行為によりユーザーに生じた損害について，一切の責任を負いません。</li>
                    </ol>
                </section>

                <section>
                    <h3 className="text-xl font-bold mt-8 mb-4 text-neutral-900 dark:text-white">第9条（退会）</h3>
                    <p>ユーザーは，運営者の定める退会手続により，本サービスから退会できるものとします。</p>
                </section>

                <section>
                    <h3 className="text-xl font-bold mt-8 mb-4 text-neutral-900 dark:text-white">第10条（保証の否認および免責事項）</h3>
                    <ol className="list-decimal pl-5 space-y-2">
                        <li>運営者は，本サービスに事実上または法律上の瑕疵（安全性，信頼性，正確性，完全性，有効性，特定の目的への適合性，セキュリティなどに関する欠陥，エラーやバグ，権利侵害などを含みます。）がないことを明示的にも黙示的にも保証しておりません。</li>
                        <li>運営者は，本サービスに起因してユーザーに生じたあらゆる損害について、運営者の故意又は重過失による場合を除き、一切の責任を負いません。</li>
                        <li>運営者は，本サービスに関して，ユーザーと他のユーザーまたは第三者との間において生じた取引，連絡または紛争等について一切責任を負いません。</li>
                    </ol>
                </section>

                <section>
                    <h3 className="text-xl font-bold mt-8 mb-4 text-neutral-900 dark:text-white">第11条（サービス内容の変更等）</h3>
                    <p>運営者は，ユーザーに通知することなく，本サービスの内容を変更しまたは本サービスの提供を中止することができるものとし，これによってユーザーに生じた損害について一切の責任を負いません。</p>
                </section>

                <section>
                    <h3 className="text-xl font-bold mt-8 mb-4 text-neutral-900 dark:text-white">第12条（利用規約の変更）</h3>
                    <p>運営者は，必要と判断した場合には，ユーザーに通知することなくいつでも本規約を変更することができるものとします。なお，本規約の変更後，本サービスの利用を開始した場合には，当該ユーザーは変更後の規約に同意したものとみなします。</p>
                </section>

                <section>
                    <h3 className="text-xl font-bold mt-8 mb-4 text-neutral-900 dark:text-white">第13条（個人情報の取扱い）</h3>
                    <p>運営者は，本サービスの利用によって取得する個人情報については，運営者「プライバシーポリシー」に従い適切に取り扱うものとします。</p>
                </section>

                <section>
                    <h3 className="text-xl font-bold mt-8 mb-4 text-neutral-900 dark:text-white">第14条（準拠法・裁判管轄）</h3>
                    <ol className="list-decimal pl-5 space-y-2">
                        <li>本規約の解釈にあたっては，日本法を準拠法とします。</li>
                        <li>本サービスに関して紛争が生じた場合には，東京地方裁判所を第一審の専属的合意管轄裁判所とします。</li>
                    </ol>
                </section>
            </div>

            <div className="mt-12 pt-12 border-t border-neutral-200 dark:border-neutral-800">
                <Link href="/" className="text-indigo-600 font-bold hover:underline">← ホームに戻る</Link>
            </div>
        </div>
    );
}
