
import Link from "next/link";

export default function PrivacyPage() {
    return (
        <div className="max-w-3xl mx-auto px-6 py-24 text-neutral-100">
            <h1 className="text-3xl font-black mb-8 text-white">プライバシーポリシー</h1>
            <div className="space-y-6 text-sm sm:text-base leading-relaxed text-neutral-300">
                <p className="font-bold mb-8">「Voca」（以下，「本サービス」といいます。）における，ユーザーの個人情報の取扱いについて，以下のとおりプライバシーポリシー（以下，「本ポリシー」といいます。）を定めます。</p>

                <section>
                    <h3 className="text-xl font-bold mt-8 mb-4 text-white">第1条（個人情報）</h3>
                    <p>「個人情報」とは，個人情報保護法にいう「個人情報」を指すものとし，生存する個人に関する情報であって，当該情報に含まれる氏名，生年月日，住所，電話番号，連絡先その他の記述等により特定の個人を識別できる情報を指します。</p>
                </section>

                <section>
                    <h3 className="text-xl font-bold mt-8 mb-4 text-white">第2条（収集する情報）</h3>
                    <p>本サービスでは，以下の情報を収集する場合があります。</p>
                    <ul className="list-disc pl-5 mt-2 space-y-1">
                        <li>Googleアカウント情報（メールアドレス，名前，プロフィール画像）</li>
                        <li>本サービスの利用履歴（作成した単語帳データ，学習履歴，生成されたコンテンツなど）</li>
                        <li>決済に関する情報（Stripe, Inc.を通じて処理され，本サービス運営者がクレジットカード情報を直接保持することはありません）</li>
                        <li>お問い合わせの際に入力された情報</li>
                        <li>Cookie（クッキー）およびアクセスログ（IPアドレス，ブラウザの種類等）</li>
                    </ul>
                </section>

                <section>
                    <h3 className="text-xl font-bold mt-8 mb-4 text-white">第3条（個人情報を収集・利用する目的）</h3>
                    <p>本サービスが個人情報を収集・利用する目的は，以下のとおりです。</p>
                    <ul className="list-disc pl-5 mt-2 space-y-1">
                        <li>本サービスの提供・運営のため</li>
                        <li>ユーザーからのお問い合わせに回答するため</li>
                        <li>メンテナンス，重要なお知らせなど必要に応じたご連絡のため</li>
                        <li>利用規約に違反したユーザーや，不正・不当な目的でサービスを利用しようとするユーザーの特定をし，ご利用をお断りするため</li>
                        <li>有料プランの課金計算・請求のため</li>
                        <li>本サービスの機能改善，新機能の開発，およびAIモデルの精度向上のための参考データとして利用するため（ただし個人を特定できない統計データ等の形式に限るか，または外部AIサービスの学習データとして利用されない設定での利用とします）</li>
                    </ul>
                </section>

                <section>
                    <h3 className="text-xl font-bold mt-8 mb-4 text-white">第4条（利用目的の変更）</h3>
                    <p>本サービスは，利用目的が変更前と関連性を有すると合理的に認められる場合に限り，個人情報の利用目的を変更するものとします。</p>
                </section>

                <section>
                    <h3 className="text-xl font-bold mt-8 mb-4 text-white">第5条（個人情報の第三者提供）</h3>
                    <p>本サービスは，あらかじめユーザーの同意を得ることなく，第三者に個人情報を提供することはありません。ただし，以下の場合を除きます。</p>
                    <ul className="list-disc pl-5 mt-2 space-y-1">
                        <li>本サービスの提供のために必要な範囲で，外部サービス（クラウドサーバーAWS/Vercel，決済代行Stripe，AIプロバイダーGoogle/OpenAIなど）に情報の処理を委託する場合。なお，AIプロバイダーへのデータ送信に際しては，原則としてAIモデルの学習に利用されない設定を適用します。</li>
                        <li>法令に基づく場合</li>
                        <li>人の生命，身体または財産の保護のために必要がある場合</li>
                        <li>公衆衛生の向上または児童の健全な育成の推進のために特に必要がある場合</li>
                        <li>国の機関もしくは地方公共団体またはその委託を受けた者が法令の定める事務を遂行することに対して協力する必要がある場合</li>
                    </ul>
                </section>

                <section>
                    <h3 className="text-xl font-bold mt-8 mb-4 text-white">第6条（Cookieおよびアクセス解析ツールについて）</h3>
                    <ol className="list-decimal pl-5 space-y-2">
                        <li>本サービスでは，ユーザーの利便性向上やサイトの利用状況把握のため，Cookieを使用することがあります。ユーザーはブラウザの設定によりCookieの受け入れを拒否することができますが，その場合，本サービスの一部が利用できなくなる可能性があります。</li>
                        <li>本サービスでは，サイトの利用状況を把握するためにGoogle Analytics等の解析ツールを利用することがあります。これらはトラフィックデータの収集のためにCookieを使用しますが，個人を特定する情報は含みません。</li>
                    </ol>
                </section>

                <section>
                    <h3 className="text-xl font-bold mt-8 mb-4 text-white">第7条（プライバシーポリシーの変更）</h3>
                    <p>本ポリシーの内容は，法令その他本ポリシーに別段の定めのある事項を除いて，ユーザーに通知することなく，変更することができるものとします。変更後のプライバシーポリシーは，本ウェブサイトに掲載したときから効力を生じるものとします。</p>
                </section>

                <section>
                    <h3 className="text-xl font-bold mt-8 mb-4 text-white">第8条（お問い合わせ窓口）</h3>
                    <p>本ポリシーに関するお問い合わせは，サービス内の「お問い合わせフォーム」よりお願いいたします。</p>
                </section>
            </div>

            <div className="mt-12 pt-12 border-t border-neutral-800">
                <Link href="/" className="text-indigo-600 font-bold hover:underline">← ホームに戻る</Link>
            </div>
        </div>
    );
}
