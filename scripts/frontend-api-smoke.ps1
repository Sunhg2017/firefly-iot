param(
  [string]$Gateway = "http://127.0.0.1:8080",
  [string]$Username = "admin",
  [string]$Password = "Admin@123456",
  [string]$OutFile = "logs/frontend-api-smoke-result.json"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function ConvertTo-BodyJson {
  param([object]$Body)
  if ($null -eq $Body) { return $null }
  return ($Body | ConvertTo-Json -Depth 12 -Compress)
}

function Get-ErrorMessage {
  param([System.Exception]$Ex)
  $status = ''
  $msg = $Ex.Message

  if ($Ex.PSObject.Properties['Response'] -and $Ex.Response) {
    try {
      $status = [string][int]$Ex.Response.StatusCode
    } catch {}
    try {
      $stream = $Ex.Response.GetResponseStream()
      if ($stream) {
        $reader = New-Object System.IO.StreamReader($stream)
        $bodyText = $reader.ReadToEnd()
        if ($bodyText) {
          try {
            $obj = $bodyText | ConvertFrom-Json
            if ($obj.message) { $msg = [string]$obj.message }
            elseif ($obj.error) { $msg = [string]$obj.error }
            else { $msg = $bodyText }
          } catch {
            $msg = $bodyText
          }
        }
      }
    } catch {}
  }

  return [pscustomobject]@{
    Status  = $status
    Message = $msg
  }
}

function Invoke-Api {
  param(
    [string]$Name,
    [string]$Method,
    [string]$Path,
    [hashtable]$Headers,
    [object]$Body = $null,
    [bool]$Optional404 = $false
  )

  $url = "$Gateway$Path"
  try {
    $response = $null
    $json = ConvertTo-BodyJson -Body $Body

    if ($Method -eq 'GET' -or $Method -eq 'DELETE') {
      $response = Invoke-RestMethod -Method $Method -Uri $url -Headers $Headers -TimeoutSec 20
    } else {
      if ($null -eq $json) {
        $json = '{}'
      }
      $response = Invoke-RestMethod -Method $Method -Uri $url -Headers $Headers -TimeoutSec 20 -ContentType 'application/json' -Body $json
    }

    if ($null -ne $response -and $response.PSObject.Properties['code']) {
      $bizCode = [int]$response.code
      if ($bizCode -ne 200 -and $bizCode -ne 0) {
        return [pscustomobject]@{
          Name = $Name
          Method = $Method
          Path = $Path
          Status = 'FAIL'
          HttpStatus = '200'
          Message = "business code=$bizCode, message=$($response.message)"
          Data = $response
        }
      }
    }

    return [pscustomobject]@{
      Name = $Name
      Method = $Method
      Path = $Path
      Status = 'PASS'
      HttpStatus = '200'
      Message = 'OK'
      Data = $response
    }
  } catch {
    $err = Get-ErrorMessage -Ex $_.Exception

    if ($Optional404 -and $err.Status -eq '404') {
      return [pscustomobject]@{
        Name = $Name
        Method = $Method
        Path = $Path
        Status = 'SKIP'
        HttpStatus = $err.Status
        Message = "optional endpoint not enabled: $($err.Message)"
        Data = $null
      }
    }

    return [pscustomobject]@{
      Name = $Name
      Method = $Method
      Path = $Path
      Status = 'FAIL'
      HttpStatus = $err.Status
      Message = $err.Message
      Data = $null
    }
  }
}

function Get-ItemsFromResponse {
  param([object]$Resp)
  if ($null -eq $Resp) { return @() }

  $data = $Resp
  if ($Resp.PSObject.Properties['data']) {
    $data = $Resp.data
  }

  if ($null -eq $data) { return @() }
  if ($data -is [System.Array]) { return $data }
  if ($data.PSObject.Properties['records'] -and $null -ne $data.records) { return $data.records }
  if ($data.PSObject.Properties['items'] -and $null -ne $data.items) { return $data.items }

  return @()
}

function Get-FirstId {
  param([object[]]$Items, [string[]]$Candidates = @('id'))

  foreach ($it in $Items) {
    foreach ($k in $Candidates) {
      if ($it.PSObject.Properties[$k] -and $null -ne $it.$k) {
        return [string]$it.$k
      }
    }
  }
  return $null
}

Write-Host "[1/4] Login via gateway: $Gateway"
$loginBody = @{
  loginMethod = 'PASSWORD'
  platform    = 'WEB'
  username    = $Username
  password    = $Password
}

$login = Invoke-Api -Name 'auth.login' -Method 'POST' -Path '/SYSTEM/api/v1/auth/login' -Headers @{'X-Platform'='WEB'} -Body $loginBody
if ($login.Status -ne 'PASS') {
  Write-Host "Login failed: $($login.Message)"
  exit 2
}

$token = $login.Data.data.accessToken
if ([string]::IsNullOrWhiteSpace($token)) {
  Write-Host 'Login failed: accessToken missing'
  exit 2
}

$headers = @{
  Authorization = "Bearer $token"
  'X-Platform'  = 'WEB'
}

Write-Host '[2/4] Fetch seed IDs'
$seed = @{}

$seedCases = @(
  @{ Key='tenantId';      Name='tenant.list';        Method='POST'; Path='/SYSTEM/api/v1/platform/tenants/list'; Body=@{}; Candidate=@('id','tenantId') },
  @{ Key='userId';        Name='user.list';          Method='POST'; Path='/SYSTEM/api/v1/users/list'; Body=@{}; Candidate=@('id','userId') },
  @{ Key='roleId';        Name='role.list';          Method='POST'; Path='/SYSTEM/api/v1/roles/list'; Body=@{}; Candidate=@('id','roleId') },
  @{ Key='projectId';     Name='project.list';       Method='POST'; Path='/SYSTEM/api/v1/projects/list'; Body=@{}; Candidate=@('id','projectId') },
  @{ Key='apiKeyId';      Name='apikey.list';        Method='POST'; Path='/SYSTEM/api/v1/api-keys/list'; Body=@{}; Candidate=@('id','apiKeyId') },
  @{ Key='productId';     Name='product.list';       Method='POST'; Path='/DEVICE/api/v1/products/list'; Body=@{}; Candidate=@('id','productId') },
  @{ Key='deviceId';      Name='device.list';        Method='POST'; Path='/DEVICE/api/v1/devices/list'; Body=@{}; Candidate=@('id','deviceId') },
  @{ Key='ruleId';        Name='rule.list';          Method='POST'; Path='/RULE/api/v1/rules/list'; Body=@{}; Candidate=@('id','ruleId') },
  @{ Key='alarmRuleId';   Name='alarmRule.list';     Method='POST'; Path='/RULE/api/v1/alarm-rules/list'; Body=@{}; Candidate=@('id','ruleId') },
  @{ Key='alarmRecordId'; Name='alarmRecord.list';   Method='POST'; Path='/RULE/api/v1/alarm-records/list'; Body=@{}; Candidate=@('id','recordId') },
  @{ Key='channelId';     Name='notifyChannel.list'; Method='GET';  Path='/SUPPORT/api/v1/notifications/channels'; Body=$null; Candidate=@('id','channelId') },
  @{ Key='notifyRecordId';Name='notifyRecord.list';  Method='POST'; Path='/SUPPORT/api/v1/notifications/records/list'; Body=@{}; Candidate=@('id','recordId') },
  @{ Key='templateId';    Name='template.list';      Method='POST'; Path='/SUPPORT/api/v1/message-templates/list'; Body=@{}; Candidate=@('id','templateId') },
  @{ Key='taskId';        Name='asyncTask.list';     Method='POST'; Path='/SUPPORT/api/v1/async-tasks/list'; Body=@{}; Candidate=@('id','taskId') },
  @{ Key='scheduleId';    Name='schedule.list';      Method='POST'; Path='/SUPPORT/api/v1/scheduled-tasks/list'; Body=@{}; Candidate=@('id','taskId') },
  @{ Key='videoDeviceId'; Name='video.list';         Method='POST'; Path='/MEDIA/api/v1/video/devices/list'; Body=@{}; Candidate=@('id','deviceId') }
)

foreach ($c in $seedCases) {
  $r = Invoke-Api -Name $c.Name -Method $c.Method -Path $c.Path -Headers $headers -Body $c.Body
  if ($r.Status -eq 'PASS') {
    $items = Get-ItemsFromResponse -Resp $r.Data
    $id = Get-FirstId -Items $items -Candidates $c.Candidate
    if ($id) {
      $seed[$c.Key] = $id
    }
  }
}

Write-Host '[3/4] Run frontend API smoke set'
$tests = @(
  @{ Name='users.me'; Method='GET'; Path='/SYSTEM/api/v1/users/me' },
  @{ Name='users.me.permissions'; Method='GET'; Path='/SYSTEM/api/v1/users/me/permissions' },
  @{ Name='tenant.menu.tree'; Method='GET'; Path='/SYSTEM/api/v1/tenant/menu-configs/tree' },
  @{ Name='tenant.self.get'; Method='GET'; Path='/SYSTEM/api/v1/tenant' },
  @{ Name='tenant.self.quota'; Method='GET'; Path='/SYSTEM/api/v1/tenant/quota' },
  @{ Name='tenant.self.usage'; Method='GET'; Path='/SYSTEM/api/v1/tenant/usage' },
  @{ Name='tenant.list'; Method='POST'; Path='/SYSTEM/api/v1/platform/tenants/list'; Body=@{} },
  @{ Name='tenant.overview'; Method='GET'; Path='/SYSTEM/api/v1/platform/tenants/overview' },
  @{ Name='user.list'; Method='POST'; Path='/SYSTEM/api/v1/users/list'; Body=@{} },
  @{ Name='role.list'; Method='POST'; Path='/SYSTEM/api/v1/roles/list'; Body=@{} },
  @{ Name='permissions.all'; Method='GET'; Path='/SYSTEM/api/v1/permissions' },
  @{ Name='permissions.groups'; Method='GET'; Path='/SYSTEM/api/v1/permissions/groups' },
  @{ Name='operation.logs.list'; Method='POST'; Path='/SYSTEM/api/v1/operation-logs/list'; Body=@{} },
  @{ Name='dict.types.list'; Method='POST'; Path='/SYSTEM/api/v1/dicts/types/list'; Body=@{} },
  @{ Name='permission.resources.tree'; Method='GET'; Path='/SYSTEM/api/v1/permission-resources/tree' },
  @{ Name='project.list'; Method='POST'; Path='/SYSTEM/api/v1/projects/list'; Body=@{} },
  @{ Name='login.logs.list'; Method='POST'; Path='/SYSTEM/api/v1/login-logs/list'; Body=@{} },
  @{ Name='apikey.list'; Method='POST'; Path='/SYSTEM/api/v1/api-keys/list'; Body=@{} },
  @{ Name='audit.logs.list'; Method='POST'; Path='/SYSTEM/api/v1/audit-logs/list'; Body=@{}; Optional404=$true },

  @{ Name='product.list'; Method='POST'; Path='/DEVICE/api/v1/products/list'; Body=@{} },
  @{ Name='device.list'; Method='POST'; Path='/DEVICE/api/v1/devices/list'; Body=@{} },
  @{ Name='device.group.list'; Method='POST'; Path='/DEVICE/api/v1/device-groups/list'; Body=@{} },
  @{ Name='device.group.all'; Method='GET'; Path='/DEVICE/api/v1/device-groups/all' },
  @{ Name='device.group.tree'; Method='GET'; Path='/DEVICE/api/v1/device-groups/tree' },
  @{ Name='device.tag.list'; Method='POST'; Path='/DEVICE/api/v1/device-tags/list'; Body=@{} },
  @{ Name='device.tag.all'; Method='GET'; Path='/DEVICE/api/v1/device-tags/all' },
  @{ Name='device.logs.list'; Method='POST'; Path='/DEVICE/api/v1/device-logs/list'; Body=@{} },
  @{ Name='device.events.list'; Method='POST'; Path='/DEVICE/api/v1/device-events/list'; Body=@{} },
  @{ Name='firmware.list'; Method='POST'; Path='/DEVICE/api/v1/firmwares/list'; Body=@{} },
  @{ Name='ota.tasks.list'; Method='POST'; Path='/DEVICE/api/v1/ota-tasks/list'; Body=@{} },

  @{ Name='rule.list'; Method='POST'; Path='/RULE/api/v1/rules/list'; Body=@{} },
  @{ Name='alarm.rule.list'; Method='POST'; Path='/RULE/api/v1/alarm-rules/list'; Body=@{} },
  @{ Name='alarm.record.list'; Method='POST'; Path='/RULE/api/v1/alarm-records/list'; Body=@{} },
  @{ Name='share.policy.owned'; Method='GET'; Path='/RULE/api/v1/share-policies/owned' },
  @{ Name='share.policy.consumed'; Method='GET'; Path='/RULE/api/v1/share-policies/consumed' },
  @{ Name='share.policy.audit.logs'; Method='POST'; Path='/RULE/api/v1/share-policies/audit-logs/list'; Body=@{} },

  @{ Name='dashboard.overview'; Method='GET'; Path='/DATA/api/v1/dashboard/overview' },
  @{ Name='dashboard.device.online.trend'; Method='GET'; Path='/DATA/api/v1/dashboard/device-online-trend' },
  @{ Name='dashboard.alarm.distribution'; Method='GET'; Path='/DATA/api/v1/dashboard/alarm-distribution' },
  @{ Name='dashboard.recent.alarms'; Method='GET'; Path='/DATA/api/v1/dashboard/recent-alarms' },
  @{ Name='dashboard.device.by.product'; Method='GET'; Path='/DATA/api/v1/dashboard/device-by-product' },
  @{ Name='monitor.all'; Method='GET'; Path='/DATA/api/v1/monitor' },
  @{ Name='monitor.jvm'; Method='GET'; Path='/DATA/api/v1/monitor/jvm' },
  @{ Name='monitor.memory'; Method='GET'; Path='/DATA/api/v1/monitor/memory' },
  @{ Name='monitor.cpu'; Method='GET'; Path='/DATA/api/v1/monitor/cpu' },
  @{ Name='monitor.disk'; Method='GET'; Path='/DATA/api/v1/monitor/disk' },
  @{ Name='monitor.thread'; Method='GET'; Path='/DATA/api/v1/monitor/thread' },
  @{ Name='monitor.gc'; Method='GET'; Path='/DATA/api/v1/monitor/gc' },
  @{ Name='monitor.server'; Method='GET'; Path='/DATA/api/v1/monitor/server' },

  @{ Name='message.templates.list'; Method='POST'; Path='/SUPPORT/api/v1/message-templates/list'; Body=@{} },
  @{ Name='notification.channels'; Method='GET'; Path='/SUPPORT/api/v1/notifications/channels' },
  @{ Name='notification.records.list'; Method='POST'; Path='/SUPPORT/api/v1/notifications/records/list'; Body=@{} },
  @{ Name='async.tasks.list'; Method='POST'; Path='/SUPPORT/api/v1/async-tasks/list'; Body=@{} },
  @{ Name='async.tasks.mine.list'; Method='POST'; Path='/SUPPORT/api/v1/async-tasks/mine/list'; Body=@{} },
  @{ Name='scheduled.tasks.list'; Method='POST'; Path='/SUPPORT/api/v1/scheduled-tasks/list'; Body=@{} },
  @{ Name='scheduled.tasks.logs.list'; Method='POST'; Path='/SUPPORT/api/v1/scheduled-tasks/logs/list'; Body=@{} },
  @{ Name='inapp.messages.list'; Method='POST'; Path='/SUPPORT/api/v1/in-app-messages/list'; Body=@{} },
  @{ Name='inapp.messages.unread'; Method='GET'; Path='/SUPPORT/api/v1/in-app-messages/unread-count' },

  @{ Name='video.devices.list'; Method='POST'; Path='/MEDIA/api/v1/video/devices/list'; Body=@{} },

  @{ Name='snmp.collectors'; Method='GET'; Path='/CONNECTOR/api/v1/snmp/collectors' },
  @{ Name='modbus.collectors'; Method='GET'; Path='/CONNECTOR/api/v1/modbus/collectors' },
  @{ Name='websocket.sessions'; Method='GET'; Path='/CONNECTOR/api/v1/websocket/sessions' },
  @{ Name='websocket.session.count'; Method='GET'; Path='/CONNECTOR/api/v1/websocket/sessions/count' },
  @{ Name='tcp.sessions'; Method='GET'; Path='/CONNECTOR/api/v1/tcp-udp/tcp/sessions' },
  @{ Name='tcp.session.count'; Method='GET'; Path='/CONNECTOR/api/v1/tcp-udp/tcp/sessions/count' },
  @{ Name='udp.peers'; Method='GET'; Path='/CONNECTOR/api/v1/tcp-udp/udp/peers' },
  @{ Name='udp.peer.count'; Method='GET'; Path='/CONNECTOR/api/v1/tcp-udp/udp/peers/count' },
  @{ Name='udp.stats'; Method='GET'; Path='/CONNECTOR/api/v1/tcp-udp/udp/stats' },
  @{ Name='tcpudp.stats'; Method='GET'; Path='/CONNECTOR/api/v1/tcp-udp/stats' },
  @{ Name='lorawan.devices'; Method='GET'; Path='/CONNECTOR/api/v1/lorawan/devices' },
  @{ Name='lorawan.device.count'; Method='GET'; Path='/CONNECTOR/api/v1/lorawan/devices/count' },
  @{ Name='lorawan.stats'; Method='GET'; Path='/CONNECTOR/api/v1/lorawan/stats' },
  @{ Name='lorawan.config'; Method='GET'; Path='/CONNECTOR/api/v1/lorawan/config' }
)

# Dynamic detail endpoints from seed ids
if ($seed.ContainsKey('tenantId')) { $tests += @{ Name='tenant.get'; Method='GET'; Path="/SYSTEM/api/v1/platform/tenants/$($seed['tenantId'])" } }
if ($seed.ContainsKey('userId')) { $tests += @{ Name='user.get'; Method='GET'; Path="/SYSTEM/api/v1/users/$($seed['userId'])" } }
if ($seed.ContainsKey('roleId')) { $tests += @{ Name='role.get'; Method='GET'; Path="/SYSTEM/api/v1/roles/$($seed['roleId'])" } }
if ($seed.ContainsKey('projectId')) { $tests += @{ Name='project.get'; Method='GET'; Path="/SYSTEM/api/v1/projects/$($seed['projectId'])" } }
if ($seed.ContainsKey('apiKeyId')) { $tests += @{ Name='apikey.get'; Method='GET'; Path="/SYSTEM/api/v1/api-keys/$($seed['apiKeyId'])" } }

if ($seed.ContainsKey('productId')) { $tests += @{ Name='product.get'; Method='GET'; Path="/DEVICE/api/v1/products/$($seed['productId'])" } }
if ($seed.ContainsKey('deviceId')) {
  $did = $seed['deviceId']
  $tests += @{ Name='device.get'; Method='GET'; Path="/DEVICE/api/v1/devices/$did" }
  $tests += @{ Name='device.secret'; Method='GET'; Path="/DEVICE/api/v1/devices/$did/secret" }
  $tests += @{ Name='device.shadow'; Method='GET'; Path="/DEVICE/api/v1/devices/$did/shadow" }
  $tests += @{ Name='device.shadow.delta'; Method='GET'; Path="/DEVICE/api/v1/devices/$did/shadow/delta" }
  $tests += @{ Name='device.tags.by.device'; Method='GET'; Path="/DEVICE/api/v1/device-tags/by-device/$did" }
  $tests += @{ Name='device.data.latest'; Method='GET'; Path="/DEVICE/api/v1/device-data/latest/$did" }
  $tests += @{ Name='device.logs.recent'; Method='GET'; Path="/DEVICE/api/v1/device-logs/$did/recent" }
  $tests += @{ Name='device.logs.count'; Method='GET'; Path="/DEVICE/api/v1/device-logs/$did/count" }
}

if ($seed.ContainsKey('ruleId')) { $tests += @{ Name='rule.get'; Method='GET'; Path="/RULE/api/v1/rules/$($seed['ruleId'])" } }
if ($seed.ContainsKey('alarmRuleId')) { $tests += @{ Name='alarm.rule.get'; Method='GET'; Path="/RULE/api/v1/alarm-rules/$($seed['alarmRuleId'])" } }
if ($seed.ContainsKey('alarmRecordId')) { $tests += @{ Name='alarm.record.get'; Method='GET'; Path="/RULE/api/v1/alarm-records/$($seed['alarmRecordId'])" } }
if ($seed.ContainsKey('taskId')) { $tests += @{ Name='async.task.get'; Method='GET'; Path="/SUPPORT/api/v1/async-tasks/$($seed['taskId'])" } }
if ($seed.ContainsKey('scheduleId')) { $tests += @{ Name='schedule.get'; Method='GET'; Path="/SUPPORT/api/v1/scheduled-tasks/$($seed['scheduleId'])" } }
if ($seed.ContainsKey('notifyRecordId')) { $tests += @{ Name='notification.record.get'; Method='GET'; Path="/SUPPORT/api/v1/notifications/records/$($seed['notifyRecordId'])" } }
if ($seed.ContainsKey('templateId')) { $tests += @{ Name='message.template.get'; Method='GET'; Path="/SUPPORT/api/v1/message-templates/$($seed['templateId'])" } }
if ($seed.ContainsKey('channelId')) { $tests += @{ Name='notification.channel.get'; Method='GET'; Path="/SUPPORT/api/v1/notifications/channels/$($seed['channelId'])" } }
if ($seed.ContainsKey('videoDeviceId')) {
  $vid = $seed['videoDeviceId']
  $tests += @{ Name='video.device.get'; Method='GET'; Path="/MEDIA/api/v1/video/devices/$vid" }
  $tests += @{ Name='video.device.channels'; Method='GET'; Path="/MEDIA/api/v1/video/devices/$vid/channels" }
}

$results = New-Object System.Collections.Generic.List[object]
foreach ($t in $tests) {
  $body = $null
  if ($t.ContainsKey('Body')) { $body = $t.Body }
  $optional404 = $false
  if ($t.ContainsKey('Optional404')) { $optional404 = [bool]$t.Optional404 }

  $res = Invoke-Api -Name $t.Name -Method $t.Method -Path $t.Path -Headers $headers -Body $body -Optional404:$optional404
  $results.Add($res)
}

$pass = @($results | Where-Object { $_.Status -eq 'PASS' }).Count
$fail = @($results | Where-Object { $_.Status -eq 'FAIL' }).Count
$skip = @($results | Where-Object { $_.Status -eq 'SKIP' }).Count

$failItems = $results | Where-Object { $_.Status -eq 'FAIL' } | Select-Object Name,Method,Path,HttpStatus,Message

$report = [pscustomobject]@{
  executedAt = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
  gateway = $Gateway
  summary = [pscustomobject]@{
    total = $results.Count
    pass = $pass
    fail = $fail
    skip = $skip
  }
  seed = $seed
  failures = $failItems
}

$dir = Split-Path -Parent $OutFile
if (-not [string]::IsNullOrWhiteSpace($dir) -and -not (Test-Path $dir)) {
  New-Item -ItemType Directory -Path $dir | Out-Null
}
$report | ConvertTo-Json -Depth 8 | Set-Content -Path $OutFile -Encoding UTF8

Write-Host "[4/4] Done. total=$($results.Count) pass=$pass fail=$fail skip=$skip"
if ($fail -gt 0) {
  Write-Host 'Failed endpoints:'
  $failItems | Format-Table -AutoSize | Out-String -Width 200 | Write-Host
}
Write-Host "Report: $OutFile"

if ($fail -gt 0) { exit 1 } else { exit 0 }
