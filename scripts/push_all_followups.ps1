[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$template = [System.IO.File]::ReadAllText("C:\Users\Calvin Koo\Desktop\telescopeoutreach\scripts\followup_template.yml")
$envLines = [System.IO.File]::ReadAllLines("C:\Users\Calvin Koo\Desktop\telescopeoutreach\.env")
$pat = (($envLines | Where-Object { $_ -match '^GH_PAT=' }) -replace '^GH_PAT=','').Trim()
$headers = @{ Authorization = "Bearer $pat"; Accept = "application/vnd.github+json"; "X-GitHub-Api-Version" = "2022-11-28" }
$base = "https://api.github.com/repos/ckootelescope/telescopeoutreach/contents/.github/workflows"

function Push-Followup($c, $n, $body) {
    $cronDay = if ($n -eq 2) { 20 } else { 25 }
    $fn = "followup_$($c.Slug)_email$n.yml"
    $yaml = $template.Replace("EMAIL_NUMBER - COMPANY_NAME", "$n - $($c.Name)")
    $yaml = $yaml.Replace("CRON_SCHEDULE", "$($c.CronMin) 15 $cronDay 5 *")
    $yaml = $yaml.Replace("COMPANY_NAME_VALUE", $c.Name)
    $yaml = $yaml.Replace("FOUNDER_NAME_VALUE", $c.Founder)
    $yaml = $yaml.Replace("FOUNDER_EMAIL_VALUE", $c.Email)
    $yaml = $yaml.Replace("COMPANY_DOMAIN_VALUE", $c.Domain)
    $yaml = $yaml.Replace("THREAD_ID_VALUE", $c.ThreadId)
    $yaml = $yaml.Replace("MESSAGE_ID_VALUE", $c.ThreadId)
    $yaml = $yaml.Replace("EMAIL_SUBJECT_VALUE", $c.Subject)
    $yaml = $yaml.Replace("EMAIL_BODY_VALUE", $body)
    $yaml = $yaml.Replace("EMAIL_NUMBER_VALUE", "$n")
    $yaml = $yaml.Replace("WORKFLOW_FILENAME", $fn)
    $yaml = $yaml.Replace("COMPANY_SLUG", $c.Slug)
    $b64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($yaml))
    $reqBody = @{ message = "[outreach] schedule Email $n for $($c.Name)"; content = $b64 } | ConvertTo-Json -Depth 3
    try {
        Invoke-RestMethod -Uri "$base/$fn" -Method Put -Headers $headers -Body $reqBody -ContentType "application/json" | Out-Null
        Write-Host "OK: $fn"
    } catch {
        Write-Host "FAIL: $fn - $($_.Exception.Message)"
    }
}

# 1. MindFort
$c = @{Name="MindFort";Slug="mindfort";Founder="Brandon Veiseh";Email="brandon@mindfort.ai";Domain="mindfort.ai";ThreadId="19e3cb47118d6479";Subject="Telescope Partners <> Mindfort";CronMin=11}
Push-Followup $c 2 "<div>Hey Brandon,<br><br>Was thinking more about the continuous security testing space. One thing I keep hearing from CISOs is that they spend more time managing pen test reports than actually fixing anything. Companies that can close the loop automatically, finding the vuln AND remediating it, are going to win big here. Curious how you think about the remediation side of things.<br><br>Would love to get 20 minutes if you're open to it.</div>"
Push-Followup $c 3 "<div>Hey Brandon, one of the portfolio companies Chris works with was recently looking at replacing their annual pen testing contract with something more continuous. Feels like this shift is happening faster than most people realize.<br><br>If now isn't the right time, totally understand. But would love to connect whenever there's a window.</div>"

# 2. Cotool
$c = @{Name="Cotool";Slug="cotool";Founder="Max Pollard";Email="max@cotool.ai";Domain="cotool.ai";ThreadId="19e3cae7ded9b5d3";Subject="Telescope <> Cotool Intro";CronMin=14}
Push-Followup $c 2 "<div>Hey Max,<br><br>Been digging into the SOC space more and the number of alerts that get ignored because teams just don't have the bandwidth is pretty staggering. The multi-agent approach where each agent handles a different part of the workflow and actually passes context to the next one feels like a much better way to keep up. Curious how you're thinking about the handoff between detection and response.<br><br>Would love to get 20 minutes if you're open to it.</div>"
Push-Followup $c 3 "<div>Hey Max, Chris was chatting with a security leader at one of our portfolio companies last week and they mentioned they're actively evaluating AI-native SOC tools. Happy to make an intro if helpful.<br><br>If now isn't the right time, totally understand. But would love to connect whenever there's a window.</div>"

# 3. RiskFront
$c = @{Name="RiskFront";Slug="riskfront";Founder="Andy Bethurum";Email="andy.bethurum@gmail.com";Domain="riskfront.ai";ThreadId="19e3ca2599a580ef";Subject="Telescope Partners <> RiskFront Intro";CronMin=17}
Push-Followup $c 2 "<div>Hey Andy,<br><br>Was reading more about the AML and sanctions screening landscape and it's kind of wild how much manual work still goes into false positive review. Teams that can use AI to triage alerts accurately in real time are going to save compliance departments a fortune. Curious where you're seeing the most demand from customers.<br><br>Would love to get 20 minutes if you're open to it.</div>"
Push-Followup $c 3 "<div>Hey Andy, a couple of fintech founders in our network have mentioned that compliance costs are becoming one of their biggest line items as they scale. Feels like there's a real pull for what you're building.<br><br>If now isn't the right time, totally understand. But would love to connect whenever there's a window.</div>"

# 4. WiseBee
$c = @{Name="WiseBee";Slug="wisebee";Founder="Stoyan Stoyanov";Email="stoyan@wisebee.ai";Domain="wisebee.ai";ThreadId="19e3c9b92b2f991c";Subject="Telescope Partners <> Wisebee Intro";CronMin=20}
Push-Followup $c 2 "<div>Hey Stoyan,<br><br>Been spending more time with security teams lately and the alert fatigue problem keeps coming up. One CISO told me their team ignores over 40% of alerts because they just can't get to them all. The companies that can cut through that noise and surface what actually matters are going to be in huge demand.<br><br>Would love to get 20 minutes if you're open to it.</div>"
Push-Followup $c 3 "<div>Hey Stoyan, Chris has been talking to a few portfolio companies about their security stack consolidation plans and the interest in AI-driven threat prioritization keeps coming up. Happy to share more on what we're hearing.<br><br>If now isn't the right time, totally understand. But would love to connect whenever there's a window.</div>"

# 5. CognitiveView
$c = @{Name="CognitiveView";Slug="cognitiveview";Founder="Dilip Mohapatra";Email="dilip@cognitiveview.com";Domain="cognitiveview.com";ThreadId="19e3c5834fad039b";Subject="AI governance and compliance | Telescope intro";CronMin=23}
Push-Followup $c 2 "<div>Hey Dilip,<br><br>Saw the EU AI Act enforcement timelines are getting closer and most companies I talk to still don't have a clear plan for compliance. The ones who move early on governance tooling are going to have a real advantage. Curious how the regulatory timeline is affecting your conversations with buyers.<br><br>Would love to get 20 minutes if you're open to it.</div>"
Push-Followup $c 3 "<div>Hey Dilip, a few companies in our portfolio have started asking us about AI governance solutions as they ramp up their own AI deployments. Happy to connect you if that would be helpful.<br><br>If now isn't the right time, totally understand. But would love to connect whenever there's a window.</div>"

# 6. Entangl
$c = @{Name="Entangl";Slug="entangl";Founder="Shapol";Email="shapol@entangl.ai";Domain="entangl.ai";ThreadId="19e3c54ccf15048b";Subject="Telescope Partners <> Entangl Intro";CronMin=26}
Push-Followup $c 2 "<div>Hey Shapol,<br><br>The more I look at the data center buildout wave the more I think the verification bottleneck is going to become a real problem. I've seen estimates that design errors caught late can cost 10x what they would have if caught early. That math alone makes the case for what you're building.<br><br>Would love to get 20 minutes if you're open to it.</div>"
Push-Followup $c 3 "<div>Hey Shapol, one of the infrastructure investors in our network was talking about how much capital is flowing into data center builds and how hard it is to find enough engineering talent to keep up with QA. Feels like perfect timing for an AI-driven approach.<br><br>If now isn't the right time, totally understand. But would love to connect whenever there's a window.</div>"

# 7. CrunchAtlas
$c = @{Name="CrunchAtlas";Slug="crunchatlas";Founder="Ben";Email="ben@crunchatlas.com";Domain="crunchatlas.com";ThreadId="19e3c50bd6d6639e";Subject="Telescope Partners <> CrunchAtlas Intro";CronMin=29}
Push-Followup $c 2 "<div>Hey Ben,<br><br>Was talking to a security engineer last week who said their biggest frustration is that most NDR tools either flood them with false positives or miss novel threats entirely. The behavioral approach that actually learns what normal looks like for each network seems like the only way to catch zero-days and lateral movement early.<br><br>Would love to get 20 minutes if you're open to it.</div>"
Push-Followup $c 3 "<div>Hey Ben, Chris has been hearing from a few portfolio companies that network visibility is one of their top security priorities this year. Happy to share more on what we're seeing across the portfolio.<br><br>If now isn't the right time, totally understand. But would love to connect whenever there's a window.</div>"

# 8. Advance
$c = @{Name="Advance";Slug="advance";Founder="Omer Rimoch";Email="omer@advancehq.com";Domain="advancehq.com";ThreadId="19e3c34b27d9707e";Subject="Telescope Partners Intro | Insurtech Investors";CronMin=32}
Push-Followup $c 2 "<div>Hey Omer,<br><br>Was thinking more about the premium finance space and I think the bigger opportunity might be that once you own the financial layer, you become the system of record for how money flows through these agencies. That kind of stickiness is rare. Curious how agencies have been responding so far.<br><br>Would love to get 20 minutes if you're open to it.</div>"
Push-Followup $c 3 "<div>Hey Omer, Chris was chatting with the iLife team recently and they mentioned a lot of agencies are looking for better financial tooling alongside their distribution platform. Feels like there's a strong pull from the market.<br><br>If now isn't the right time, totally understand. But would love to connect whenever there's a window.</div>"

# 9. Dearborn Labs
$c = @{Name="Dearborn Labs";Slug="dearborn_labs";Founder="Kyle Nakatsuji";Email="kyle@dearbornlabs.com";Domain="dearbornlabs.com";ThreadId="19e3c15a110f24ee";Subject="AI infrastructure for insurance | Telescope Partners Intro";CronMin=35}
Push-Followup $c 2 "<div>Hey Kyle,<br><br>Been spending more time in insurance and what keeps jumping out is that most carriers are still running on legacy systems that are 20+ years old. The ones who want to adopt AI have to basically rebuild from scratch, which is a huge advantage for companies like Dearborn that are building the AI-native infrastructure from day one.<br><br>Would love to get 20 minutes if you're open to it.</div>"
Push-Followup $c 3 "<div>Hey Kyle, Chris was recently catching up with the iLife team and they mentioned carrier partners are actively looking for modern underwriting infrastructure. Happy to make intros if useful.<br><br>If now isn't the right time, totally understand. But would love to connect whenever there's a window.</div>"

# 10. Caribou
$c = @{Name="Caribou";Slug="caribou";Founder="Juan Andrade";Email="juan@usecaribou.com";Domain="usecaribou.com";ThreadId="19e3be9fc5da6cb8";Subject="Killing Big Four transfer pricing | Telescope Partners Intro";CronMin=38}
Push-Followup $c 2 "<div>Hey Juan,<br><br>Been thinking more about the transfer pricing problem and it's pretty telling that 20% of UK YC companies are already using Caribou. That kind of adoption rate usually means the product is solving a real pain point founders have been hacking around for years. Curious how the US expansion is going.<br><br>Would love to get 20 minutes if you're open to it.</div>"
Push-Followup $c 3 "<div>Hey Juan, a few founders in our portfolio with international operations have mentioned how painful transfer pricing has been to set up. Usually one of those things that falls through the cracks until the auditors show up.<br><br>If now isn't the right time, totally understand. But would love to connect whenever there's a window.</div>"

# 11. Specmade
$c = @{Name="Specmade";Slug="specmade";Founder="Matt Pierce";Email="matt@specmade.com";Domain="specmade.com";ThreadId="19e3be5d204d4ca1";Subject="Telescope Partners <> Specmade Intro";CronMin=41}
Push-Followup $c 2 "<div>Hey Matt,<br><br>Was thinking about the home inspection space and one thing that struck me is how fragmented the market is. Most inspectors are independent or small shops, which means the product needs to just work out of the box. The fact that you built offline mode from the start tells me you really understand the user.<br><br>Would love to get 20 minutes if you're open to it.</div>"
Push-Followup $c 3 "<div>Hey Matt, a few of the vertical SaaS companies in our portfolio have found that once you own the report or the document of record, you can expand into payments, scheduling, and other adjacent workflows pretty naturally.<br><br>If now isn't the right time, totally understand. But would love to connect whenever there's a window.</div>"

# 12. Assail AI
$c = @{Name="Assail AI";Slug="assail_ai";Founder="Alissa Knight";Email="alissa.knight@assailai.com";Domain="assailai.com";ThreadId="19e3be35d5296cb4";Subject="Telescope <> Assail AI Intro";CronMin=44}
Push-Followup $c 2 "<div>Hey Alissa,<br><br>The more I dig into API security the more it feels like most tools are built for finding vulnerabilities but not actually testing them the way an attacker would. Offensive testing that simulates real attacks against live APIs is a different category entirely. Curious how enterprises are thinking about the shift from passive scanning to active testing.<br><br>Would love to get 20 minutes if you're open to it.</div>"
Push-Followup $c 3 "<div>Hey Alissa, Chris was recently talking to security leaders at a couple portfolio companies and API security keeps coming up as a top priority for 2026. Happy to share more on what we're hearing from buyers.<br><br>If now isn't the right time, totally understand. But would love to connect whenever there's a window.</div>"

Write-Host "`nDone. 24 workflow files processed."
