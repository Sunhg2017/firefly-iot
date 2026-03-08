package com.songhg.firefly.iot.support.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresLogin;
import com.songhg.firefly.iot.support.dto.message.InAppMessageCreateDTO;
import com.songhg.firefly.iot.support.dto.message.InAppMessageQueryDTO;
import com.songhg.firefly.iot.support.dto.message.InAppMessageVO;
import com.songhg.firefly.iot.support.service.InAppMessageService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@Tag(name = "站内信", description = "站内消息收发与管理")
@RestController
@RequestMapping("/api/v1/in-app-messages")
@RequiredArgsConstructor
@RequiresLogin
public class InAppMessageController {

    private final InAppMessageService inAppMessageService;

    @PostMapping("/list")
    @Operation(summary = "分页查询我的站内信")
    public R<IPage<InAppMessageVO>> listMyMessages(@RequestBody InAppMessageQueryDTO query) {
        return R.ok(inAppMessageService.listMyMessages(query));
    }

    @GetMapping("/unread-count")
    @Operation(summary = "查询未读消息数")
    public R<Integer> countUnread() {
        return R.ok(inAppMessageService.countUnread());
    }

    @PutMapping("/{id}/read")
    @Operation(summary = "标记为已读")
    public R<Void> markAsRead(@Parameter(description = "消息编号", required = true) @PathVariable Long id) {
        inAppMessageService.markAsRead(id);
        return R.ok();
    }

    @PutMapping("/read-all")
    @Operation(summary = "全部标记为已读")
    public R<Void> markAllAsRead() {
        inAppMessageService.markAllAsRead();
        return R.ok();
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "删除站内信")
    public R<Void> deleteMessage(@Parameter(description = "消息编号", required = true) @PathVariable Long id) {
        inAppMessageService.deleteMessage(id);
        return R.ok();
    }

    @PostMapping
    @Operation(summary = "发送站内信（管理接口）")
    public R<InAppMessageVO> sendMessage(@Valid @RequestBody InAppMessageCreateDTO dto) {
        return R.ok(inAppMessageService.sendMessage(dto));
    }
}
